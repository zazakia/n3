import Toast from '../components/AppToast';

export enum ErrorType {
    NETWORK = 'NETWORK',
    AUTH = 'AUTH',
    SYNC = 'SYNC',
    VALIDATION = 'VALIDATION',
    DATABASE = 'DATABASE',
    UNKNOWN = 'UNKNOWN',
}

export interface AppError {
    message: string;
    type: ErrorType;
    originalError?: any;
    context?: string;
}

class ErrorServiceClass {
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
        }

        return {
            message,
            type: detectedType,
            originalError: error,
            context
        };
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
            Toast.show({
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
            Toast.show({
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
            Toast.show({
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
