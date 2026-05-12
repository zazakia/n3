import React from 'react';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';
import LoginScreen from '../login';
import { AuthService } from '../../src/services/AuthService';
import { useRouter } from 'expo-router';

// Mock AuthService
jest.mock('../../src/services/AuthService', () => ({
    AuthService: {
        isQuickLoginEnabled: jest.fn().mockReturnValue(true),
        signIn: jest.fn(),
        getQuickLoginUsers: jest.fn().mockResolvedValue([]),
    },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
    useRouter: jest.fn(),
}));

// Mock icons
jest.mock('@expo/vector-icons', () => ({
    MaterialIcons: () => null,
    Ionicons: () => null,
}));

describe('LoginScreen', () => {
    const mockReplace = jest.fn();
    const mockPush = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace, push: mockPush });
        (AuthService.isQuickLoginEnabled as jest.Mock).mockReturnValue(true);
        (AuthService.getQuickLoginUsers as jest.Mock).mockResolvedValue([]);
    });

    it('renders correctly', async () => {
        render(<LoginScreen />);
        
        // Wait for useEffect state updates to finish
        await waitFor(() => {
            expect(AuthService.getQuickLoginUsers).toHaveBeenCalled();
        });

        expect(screen.getByPlaceholderText('user@infinityfinance.com')).toBeTruthy();
        expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
        expect(screen.getByText(/SIGN IN/i)).toBeTruthy();
    });

    it('handles successful login', async () => {
        (AuthService.signIn as jest.Mock).mockResolvedValue({ user: { id: '123' }, error: null });
        
        render(<LoginScreen />);
        
        fireEvent.changeText(screen.getByPlaceholderText('user@infinityfinance.com'), 'test@example.com');
        fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'password123');
        
        fireEvent.press(screen.getByText(/SIGN IN/i));

        await waitFor(() => {
            expect(AuthService.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
        });
        expect(mockReplace).toHaveBeenCalledWith('/loading');
    });

    it('shows error on empty fields', async () => {
        render(<LoginScreen />);
        fireEvent.press(screen.getByText(/SIGN IN/i));
        expect(await screen.findByText(/Please enter both email and password/i)).toBeTruthy();
    });

    it('shows error on login failure', async () => {
        (AuthService.signIn as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));
        
        render(<LoginScreen />);
        
        fireEvent.changeText(screen.getByPlaceholderText('user@infinityfinance.com'), 'test@example.com');
        fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'password123');
        fireEvent.press(screen.getByText(/SIGN IN/i));

        expect(await screen.findByText(/Invalid credentials/i)).toBeTruthy();
    });

    it('loads and displays quick login users', async () => {
        const mockUsers = [
            { id: '1', full_name: 'Admin User', role: 'admin', email: 'admin@loanbrick.com' },
            { id: '2', full_name: 'Collector User', role: 'collector', email: 'collector@loanbrick.com' }
        ];
        (AuthService.getQuickLoginUsers as jest.Mock).mockResolvedValue(mockUsers);

        render(<LoginScreen />);

        expect(await screen.findByText('Admin User')).toBeTruthy();
        expect(screen.getByText('Collector User')).toBeTruthy();
        expect(screen.getByText('admin@loanbrick.com')).toBeTruthy();
    });

    it('handles quick login correctly', async () => {
        const mockUsers = [{ id: 'mock-admin', full_name: 'Admin User', role: 'admin', email: 'admin@loanbrick.com' }];
        (AuthService.getQuickLoginUsers as jest.Mock).mockResolvedValue(mockUsers);
        (AuthService.signIn as jest.Mock).mockResolvedValue({});

        render(<LoginScreen />);

        // Wait for dynamic users to lead to filtering of hardcoded ones
        await waitFor(() => {
            expect(AuthService.getQuickLoginUsers).toHaveBeenCalled();
        });

        const quickLoginBtn = await screen.findByTestId('quick-login-admin@loanbrick.com');
        fireEvent.press(quickLoginBtn);

        await waitFor(() => {
            expect(AuthService.signIn).toHaveBeenCalledWith('admin@loanbrick.com', '12345678');
        }, { timeout: 2000 });
        expect(mockReplace).toHaveBeenCalledWith('/loading');
    });

    it('handles cybergada quick login correctly', async () => {
        const mockUsers = [{ id: 'cybergada-mock', full_name: 'Main Dev (Cybergada)', role: 'admin', email: 'cybergada@gmail.com' }];
        (AuthService.getQuickLoginUsers as jest.Mock).mockResolvedValue(mockUsers);
        (AuthService.signIn as jest.Mock).mockResolvedValue({});

        render(<LoginScreen />);

        await waitFor(() => {
            expect(AuthService.getQuickLoginUsers).toHaveBeenCalled();
        });

        const quickLoginBtn = await screen.findByTestId('quick-login-cybergada@gmail.com');
        fireEvent.press(quickLoginBtn);

        await waitFor(() => {
            expect(AuthService.signIn).toHaveBeenCalledWith('cybergada@gmail.com', '12345678');
        }, { timeout: 2000 });
        expect(mockReplace).toHaveBeenCalledWith('/loading');
    });

    it('handles quick login failure', async () => {
        const mockUsers = [{ id: 'mock-admin-fail', full_name: 'Admin User', role: 'admin', email: 'admin@loanbrick.com' }];
        (AuthService.getQuickLoginUsers as jest.Mock).mockResolvedValue(mockUsers);
        (AuthService.signIn as jest.Mock).mockRejectedValue(new Error('Quick fail'));

        render(<LoginScreen />);

        await waitFor(() => {
            expect(AuthService.getQuickLoginUsers).toHaveBeenCalled();
        });

        const quickLoginBtn = await screen.findByTestId('quick-login-admin@loanbrick.com');
        fireEvent.press(quickLoginBtn);

        expect(await screen.findByText('Quick fail')).toBeTruthy();
    });

    it('handles quick users load failure gracefully', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        (AuthService.getQuickLoginUsers as jest.Mock).mockRejectedValue(new Error('Network error'));

        render(<LoginScreen />);

        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalled();
        });
        consoleSpy.mockRestore();
    });

    it('does not load or render quick login when disabled', async () => {
        (AuthService.isQuickLoginEnabled as jest.Mock).mockReturnValue(false);

        render(<LoginScreen />);

        await waitFor(() => {
            expect(screen.getByText(/SIGN IN/i)).toBeTruthy();
        });

        expect(AuthService.getQuickLoginUsers).not.toHaveBeenCalled();
        expect(screen.queryByText(/Quick Access/i)).toBeNull();
    });

    it('shows specific error for unconfirmed email', async () => {
        (AuthService.signIn as jest.Mock).mockRejectedValue(new Error('Auth error: Email not confirmed'));
        
        render(<LoginScreen />);
        
        fireEvent.changeText(screen.getByPlaceholderText('user@infinityfinance.com'), 'test@example.com');
        fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'password123');
        fireEvent.press(screen.getByText(/SIGN IN/i));

        expect(await screen.findByText(/Account email not confirmed. Please check your inbox/i)).toBeTruthy();
    });

    it('toggles password visibility', async () => {
        render(<LoginScreen />);
        await waitFor(() => {
            expect(AuthService.getQuickLoginUsers).toHaveBeenCalled();
        });

        const passwordInput = screen.getByPlaceholderText('••••••••');
        
        // Initial state is secure
        expect(passwordInput.props.secureTextEntry).toBe(true);

        const toggleBtn = screen.getByTestId('password-toggle');
        fireEvent.press(toggleBtn);

        expect(passwordInput.props.secureTextEntry).toBe(false);
    });

    it('navigates to register when register now is pressed', async () => {
        render(<LoginScreen />);
        await waitFor(() => {
            expect(AuthService.getQuickLoginUsers).toHaveBeenCalled();
        });

        fireEvent.press(screen.getByText(/Register Now/i));
        const mockRouter = require('expo-router').useRouter();
        expect(mockRouter.push).toHaveBeenCalledWith('/register');
    });
});

