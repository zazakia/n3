import { ErrorService, ErrorType, ErrorCode } from '../ErrorService';

describe('ErrorService', () => {
    let consoleSpy: jest.SpyInstance;
    let mockToast: { show: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        mockToast = { show: jest.fn() };
        ErrorService.setToastAdapter(mockToast);
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe('handleError', () => {
        it('normalizes a string error', () => {
            const appError = ErrorService.handleError('Simple error');
            expect(appError.message).toBe('Simple error');
            expect(appError.type).toBe(ErrorType.UNKNOWN);
        });

        it('normalizes an Error object', () => {
            const error = new Error('Test error');
            const appError = ErrorService.handleError(error, 'TestContext');
            expect(appError.message).toBe('Test error');
            expect(appError.context).toBe('TestContext');
        });

        it('normalizes a WatermelonDB error', () => {
            const error = new Error('Validation failed');
            (error as any).name = 'WatermelonDBError';
            const appError = ErrorService.handleError(error);
            expect(appError.type).toBe(ErrorType.DATABASE);
        });

        it('correctly normalizes validation errors — no toast shown', () => {
            const appError = ErrorService.handleError('Field required', 'ctx', ErrorType.VALIDATION);
            expect(appError.type).toBe(ErrorType.VALIDATION);
            expect(mockToast.show).not.toHaveBeenCalled();
        });

        it('handles non-Error objects with a message property', () => {
            const error = { message: 'Object error' };
            const appError = ErrorService.handleError(error);
            expect(appError.message).toBe('Object error');
        });

        it('detects auth errors from message', () => {
            const error = { message: 'Auth failed' };
            const appError = ErrorService.handleError(error);
            expect(appError.type).toBe(ErrorType.AUTH);
        });

        it('detects network errors', () => {
            const error = new Error('Failed to fetch data');
            const appError = ErrorService.handleError(error);
            expect(appError.type).toBe(ErrorType.NETWORK);
        });

        it('falls back to default message for unknown error shapes', () => {
            const appError = ErrorService.handleError(null);
            expect(appError.message).toBe('An unexpected error occurred');
        });
    });

    describe('error codes', () => {
        it('assigns AUTH_INVALID_CREDENTIALS for 401 auth errors', () => {
            const err = ErrorService.handleError({ message: 'invalid credentials', status: 401 }, 'ctx', ErrorType.AUTH);
            expect(err.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
        });

        it('assigns AUTH_SESSION_EXPIRED for expired session', () => {
            const err = ErrorService.handleError({ message: 'session expired' }, 'ctx', ErrorType.AUTH);
            expect(err.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
        });

        it('assigns AUTH_UNAUTHORIZED as default auth code', () => {
            const err = ErrorService.handleError({ message: 'permission denied' }, 'ctx', ErrorType.AUTH);
            expect(err.code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
        });

        it('assigns NETWORK_TIMEOUT for timeout errors', () => {
            const err = ErrorService.handleError(new Error('request timeout'), 'ctx', ErrorType.NETWORK);
            expect(err.code).toBe(ErrorCode.NETWORK_TIMEOUT);
        });

        it('assigns NETWORK_OFFLINE as default network code', () => {
            const err = ErrorService.handleError(new Error('fetch failed'), 'ctx', ErrorType.NETWORK);
            expect(err.code).toBe(ErrorCode.NETWORK_OFFLINE);
        });

        it('assigns DB_NOT_FOUND for record not found', () => {
            const err = ErrorService.handleError(new Error('record not found'), 'ctx', ErrorType.DATABASE);
            expect(err.code).toBe(ErrorCode.DB_NOT_FOUND);
        });

        it('assigns DB_UNINITIALIZED for uninitialized db', () => {
            const err = ErrorService.handleError(new Error('database not initialized'), 'ctx', ErrorType.DATABASE);
            expect(err.code).toBe(ErrorCode.DB_UNINITIALIZED);
        });

        it('assigns SYNC_PUSH_FAILED for push errors', () => {
            const err = ErrorService.handleError(new Error('push failed'), 'ctx', ErrorType.SYNC);
            expect(err.code).toBe(ErrorCode.SYNC_PUSH_FAILED);
        });

        it('assigns SYNC_PULL_FAILED as default sync code', () => {
            const err = ErrorService.handleError(new Error('sync error'), 'ctx', ErrorType.SYNC);
            expect(err.code).toBe(ErrorCode.SYNC_PULL_FAILED);
        });

        it('assigns VALIDATION_REQUIRED for required field errors', () => {
            const err = ErrorService.handleError(new Error('field required'), 'ctx', ErrorType.VALIDATION);
            expect(err.code).toBe(ErrorCode.VALIDATION_REQUIRED);
        });

        it('assigns VALIDATION_INVALID as default validation code', () => {
            const err = ErrorService.handleError(new Error('invalid value'), 'ctx', ErrorType.VALIDATION);
            expect(err.code).toBe(ErrorCode.VALIDATION_INVALID);
        });

        it('assigns UNKNOWN code for unknown type', () => {
            const err = ErrorService.handleError(new Error('something'), 'ctx', ErrorType.UNKNOWN);
            expect(err.code).toBe(ErrorCode.UNKNOWN);
        });
    });

    describe('toasts', () => {
        it('shows specific toast for SYNC error', () => {
            ErrorService.handleError('sync fail', 'sync', ErrorType.SYNC);
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                text1: 'Sync Failed',
            }));
        });

        it('shows specific toast for DATABASE error', () => {
            ErrorService.handleError('db fail', 'db', ErrorType.DATABASE);
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                text1: 'Database Error',
            }));
        });

        it('shows specific toast for AUTH error', () => {
            ErrorService.handleError('auth fail', 'auth', ErrorType.AUTH);
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                text1: 'Authentication Error',
            }));
        });

        it('shows specific toast for NETWORK error', () => {
            ErrorService.handleError('network fail', 'net', ErrorType.NETWORK);
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                text1: 'Connection Issue',
            }));
        });

        it('shows generic Error title for UNKNOWN type', () => {
            ErrorService.handleError('something', 'ctx', ErrorType.UNKNOWN);
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                text1: 'Error',
            }));
        });

        it('shows success toast', () => {
            ErrorService.showSuccessToast('Job done');
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                type: 'success',
                text2: 'Job done',
            }));
        });

        it('shows info toast', () => {
            ErrorService.showInfoToast('Heads up');
            expect(mockToast.show).toHaveBeenCalledWith(expect.objectContaining({
                type: 'info',
                text2: 'Heads up',
            }));
        });

        it('handles toast.show throwing gracefully', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            mockToast.show.mockImplementation(() => { throw new Error('toast crash'); });
            expect(() => ErrorService.handleError('err', 'ctx', ErrorType.UNKNOWN)).not.toThrow();
            warnSpy.mockRestore();
        });
    });

    describe('setToastAdapter', () => {
        it('uses the injected adapter instead of the default', () => {
            const custom = { show: jest.fn() };
            ErrorService.setToastAdapter(custom);
            ErrorService.showSuccessToast('test');
            expect(custom.show).toHaveBeenCalled();
        });
    });
});
