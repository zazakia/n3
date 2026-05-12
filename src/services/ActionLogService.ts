import { database as globalDatabase } from '../database';
import { Database, Q } from '@nozbe/watermelondb';
import ActionLog from '../database/models/ActionLog';
import { AuthService } from './AuthService';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

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

        return paramsList.map(params => {
            const currentUserId = params.performedBy || defaultUser;
            return collection.prepareCreate(log => {
                log.entityType = params.entityType;
                log.entityId = params.entityId;
                log.action = params.action;
                log.performedBy = currentUserId;
                log.oldData = params.oldData ? JSON.stringify(params.oldData) : '';
                log.newData = params.newData ? JSON.stringify(params.newData) : '';
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

        if (entityType) {
            query = query.extend(Q.where('entity_type', entityType));
        }

        return query.extend(Q.sortBy('timestamp', Q.desc), Q.take(limit));
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
