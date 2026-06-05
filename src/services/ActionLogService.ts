import { database as globalDatabase } from '../database';
import { Database, Q } from '@nozbe/watermelondb';
import ActionLog from '../database/models/ActionLog';
import { AuthService } from './AuthService';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
const VALID_ACTIONS = new Set<ActionType>(['CREATE', 'UPDATE', 'DELETE', 'RESTORE']);
const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[Circular]';
const MAX_AUDIT_PAYLOAD_CHARS = 20000;
const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 500;
const SENSITIVE_FIELD_PATTERN = /(password|passcode|pin|token|secret|session|refresh|access[_-]?token|api[_-]?key|authorization)/i;

export interface LogParams {
    entityType: string;
    entityId: string;
    action: ActionType;
    oldData?: any;
    newData?: any;
    performedBy?: string;
}

export class ActionLogService {
    private _db?: Database;

    constructor(db?: Database) {
        this._db = db;
    }

    private get db(): Database {
        const db = this._db || globalDatabase;
        if (!db) {
            console.error('[ActionLogService] Database is not initialized!');
        }
        return db;
    }

    async logAction(params: LogParams) {
        return this.logActions([params]);
    }

    private normalizeText(value: unknown): string {
        return typeof value === 'string' ? value.trim() : '';
    }

    private isValidParams(params: LogParams): boolean {
        const entityType = this.normalizeText(params.entityType);
        const entityId = this.normalizeText(params.entityId);

        if (!entityType || !entityId || !VALID_ACTIONS.has(params.action)) {
            console.warn('[ActionLogService] Skipping malformed audit log params', {
                entityType: params.entityType,
                entityId: params.entityId,
                action: params.action,
            });
            return false;
        }

        return true;
    }

    private sanitizePayload(value: unknown, seen = new WeakSet<object>()): unknown {
        if (value === undefined) return '[undefined]';
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
            return value;
        }
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
        if (value instanceof Date) return value.toISOString();

        if (typeof value === 'object') {
            if (seen.has(value)) return CIRCULAR_VALUE;
            seen.add(value);

            if (Array.isArray(value)) {
                const output = value.map(item => this.sanitizePayload(item, seen));
                seen.delete(value);
                return output;
            }

            const output: Record<string, unknown> = {};
            for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
                output[key] = SENSITIVE_FIELD_PATTERN.test(key)
                    ? REDACTED_VALUE
                    : this.sanitizePayload(entry, seen);
            }
            seen.delete(value);
            return output;
        }

        return String(value);
    }

    private serializePayload(value: unknown): string {
        if (value === undefined || value === null) return '';

        try {
            const serialized = JSON.stringify(this.sanitizePayload(value));
            if (!serialized) return '';
            return serialized.length > MAX_AUDIT_PAYLOAD_CHARS
                ? `${serialized.slice(0, MAX_AUDIT_PAYLOAD_CHARS)}...[truncated]`
                : serialized;
        } catch (error) {
            console.error('[ActionLogService] Failed to serialize audit payload:', error);
            return JSON.stringify({ serializationError: 'Unable to serialize audit payload' });
        }
    }

    private normalizeLimit(limit: number): number {
        if (!Number.isFinite(limit)) return DEFAULT_LOG_LIMIT;
        return Math.max(1, Math.min(MAX_LOG_LIMIT, Math.floor(limit)));
    }

    /**
     * Prepares action logs to be included in a database batch.
     * Use this when you are already inside a database.write() block.
     */
    prepareLogActionsSync(paramsList: LogParams[], defaultUser: string = 'system'): any[] {
        if (paramsList.length === 0) return [];

        const db = this.db;
        if (!db) return [];

        const collection = db.get<ActionLog>('action_logs');
        if (!collection) {
            console.error('[ActionLogService] action_logs collection not found!');
            return [];
        }

        return paramsList.filter(params => this.isValidParams(params)).map(params => {
            const currentUserId = this.normalizeText(params.performedBy) || defaultUser;
            return collection.prepareCreate(log => {
                log.entityType = this.normalizeText(params.entityType);
                log.entityId = this.normalizeText(params.entityId);
                log.action = params.action;
                log.performedBy = currentUserId;
                log.oldData = this.serializePayload(params.oldData);
                log.newData = this.serializePayload(params.newData);
                log.timestamp = Date.now();
            });
        });
    }

    async prepareLogActions(paramsList: LogParams[]): Promise<any[]> {
        const defaultUser = await AuthService.getCurrentUserId() || 'system';
        return this.prepareLogActionsSync(paramsList, defaultUser);
    }

    async logActions(paramsList: LogParams[]) {
        if (paramsList.length === 0) return;

        try {
            const db = this.db;
            if (!db) return;

            const preparedLogs = await this.prepareLogActions(paramsList);
            if (preparedLogs.length === 0) return;

            await db.write(async () => {
                await db.batch(...preparedLogs);
            });
        } catch (error) {
            console.error('Failed to log actions:', error);
        }
    }

    private buildLogsQuery(limit: number = 50, entityType?: string) {
        const db = this.db;
        if (!db) return null;

        let query = db.get<ActionLog>('action_logs').query();
        const normalizedEntityType = this.normalizeText(entityType);

        if (normalizedEntityType) {
            query = query.extend(Q.where('entity_type', normalizedEntityType));
        }

        return query.extend(Q.sortBy('timestamp', Q.desc), Q.take(this.normalizeLimit(limit)));
    }

    async getLogs(limit: number = 50, entityType?: string) {
        try {
            const query = this.buildLogsQuery(limit, entityType);
            return query ? await query.fetch() : [];
        } catch (error) {
            console.error('Failed to fetch action logs:', error);
            return [];
        }
    }

    observeLogs(limit: number = 50, entityType?: string) {
        const query = this.buildLogsQuery(limit, entityType);
        return query ? query.observe() : null;
    }
}

export default new ActionLogService();
