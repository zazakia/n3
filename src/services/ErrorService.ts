import Toast from '../components/AppToast';

export enum ErrorType {
    NETWORK = 'NETWORK',
    AUTH = 'AUTH',
    SYNC = 'SYNC',
    VALIDATION = 'VALIDATION',
    DATABASE = 'DATABASE',
    UNKNOWN = 'UNKNOWN',
}

/** Structured error codes for programmatic handling */
export enum ErrorCode {
    // Auth
    AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
    AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
    AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
    // Network
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    NETWORK_OFFLINE = 'NETWORK_OFFLINE',
    // Database
    DB_NOT_FOUND = 'DB_NOT_FOUND',
    DB_CONSTRAINT = 'DB_CONSTRAINT',
    DB_UNINITIALIZED = 'DB_UNINITIALIZED',
    // Sync
    SYNC_PUSH_FAILED = 'SYNC_PUSH_FAILED',
    SYNC_PULL_FAILED = 'SYNC_PULL_FAILED',
    // Validation
    VALIDATION_REQUIRED = 'VALIDATION_REQUIRED',
    VALIDATION_INVALID = 'VALIDATION_INVALID',
    // Generic
    UNKNOWN = 'UNKNOWN',
}

export interface AppError {
    message: string;
    type: ErrorType;
    code?: ErrorCode;
    originalError?: any;
    context?: string;
}

export type ToastAdapter = {
    show: (params: {
        type: string;
        text1: string;
        text2?: string;
        position?: string;
        visibilityTime?: number;
    }) => void;
};

class ErrorServiceClass {
    /** Replaceable toast adapter — swap in tests via setToastAdapter() */
    private toast: ToastAdapter = Toast as ToastAdapter;

    /** Override the toast implementation (useful in tests or custom UI) */
    setToastAdapter(adapter: ToastAdapter) {
        this.toast = adapter;
    }

    public handleError(error: any, context?: string, defaultType: ErrorType = ErrorType.UNKNOWN): AppError {
        const appError = this.normalizeError(error, context, defaultType);

        console.error(`[ErrorService] [${appError.type}] Context: ${context || 'N/A'}`, appError.message, appError.originalError);

        // Show user-friendly toast for most errors
        if (appError.type !== ErrorType.VALIDATION) {
            this.showErrorToast(appError);
        }

        return appError;
    }

    private normalizeError(error: any, context?: string, type?: ErrorType): AppError {
        let message = 'An unexpected error occurred';
        let detectedType = type || ErrorType.UNKNOWN;
        let code: ErrorCode | undefined;

        if (typeof error === 'string') {
            message = error;
        } else {
            if (error instanceof Error) {
                message = error.message;
            } else if (error && typeof error === 'object' && error.message) {
                message = error.message;
            }

            // Type detection logic
            if (detectedType === ErrorType.UNKNOWN) {
                const searchStr = (message + ' ' + (error?.name || '')).toLowerCase();

                if (searchStr.includes('network') || searchStr.includes('fetch')) {
                    detectedType = ErrorType.NETWORK;
                } else if (searchStr.includes('auth') || searchStr.includes('permission') || searchStr.includes('session')) {
                    detectedType = ErrorType.AUTH;
                } else if (error?.name === 'WatermelonDBError' || searchStr.includes('database') || searchStr.includes('sqlite')) {
                    detectedType = ErrorType.DATABASE;
                }
            }

            // Error code detection
            code = this.detectErrorCode(message, error, detectedType);
        }

        return {
            message,
            type: detectedType,
            code,
            originalError: error,
            context,
        };
    }

    private detectErrorCode(message: string, error: any, type: ErrorType): ErrorCode {
        const lower = message.toLowerCase();
        const status = error?.status ?? error?.statusCode;

        switch (type) {
            case ErrorType.AUTH:
                if (status === 401 || lower.includes('invalid') || lower.includes('credentials')) return ErrorCode.AUTH_INVALID_CREDENTIALS;
                if (lower.includes('expired') || lower.includes('session')) return ErrorCode.AUTH_SESSION_EXPIRED;
                return ErrorCode.AUTH_UNAUTHORIZED;
            case ErrorType.NETWORK:
                if (lower.includes('timeout')) return ErrorCode.NETWORK_TIMEOUT;
                return ErrorCode.NETWORK_OFFLINE;
            case ErrorType.DATABASE:
                if (lower.includes('not found') || lower.includes('record not found')) return ErrorCode.DB_NOT_FOUND;
                if (lower.includes('constraint') || lower.includes('unique') || lower.includes('fk')) return ErrorCode.DB_CONSTRAINT;
                if (lower.includes('not initialized') || lower.includes('uninitialized')) return ErrorCode.DB_UNINITIALIZED;
                return ErrorCode.DB_CONSTRAINT;
            case ErrorType.SYNC:
                if (lower.includes('push')) return ErrorCode.SYNC_PUSH_FAILED;
                return ErrorCode.SYNC_PULL_FAILED;
            case ErrorType.VALIDATION:
                if (lower.includes('required')) return ErrorCode.VALIDATION_REQUIRED;
                return ErrorCode.VALIDATION_INVALID;
            default:
                return ErrorCode.UNKNOWN;
        }
    }

    private showErrorToast(error: AppError) {
        let title = 'Error';

        switch (error.type) {
            case ErrorType.AUTH:
                title = 'Authentication Error';
                break;
            case ErrorType.SYNC:
                title = 'Sync Failed';
                break;
            case ErrorType.NETWORK:
                title = 'Connection Issue';
                break;
            case ErrorType.DATABASE:
                title = 'Database Error';
                break;
        }

        try {
            this.toast.show({
                type: 'error',
                text1: title,
                text2: error.message,
                position: 'bottom',
                visibilityTime: 4000,
            });
        } catch (toastErr) {
            console.warn('[ErrorService] Toast.show failed (likely library incompatibility):', toastErr);
        }
    }

    public showSuccessToast(message: string, title: string = 'Success') {
        try {
            this.toast.show({
                type: 'success',
                text1: title,
                text2: message,
                position: 'bottom',
                visibilityTime: 3000,
            });
        } catch (toastErr) {
            console.warn('[ErrorService] Toast.show failed:', toastErr);
        }
    }

    public showInfoToast(message: string, title: string = 'Info') {
        try {
            this.toast.show({
                type: 'info',
                text1: title,
                text2: message,
                position: 'bottom',
                visibilityTime: 3000,
            });
        } catch (toastErr) {
            console.warn('[ErrorService] Toast.show failed:', toastErr);
        }
    }
}

export const ErrorService = new ErrorServiceClass();
