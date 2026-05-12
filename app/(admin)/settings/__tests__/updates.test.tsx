import React from 'react';
import { render, screen } from '@testing-library/react-native';
import UpdatesScreen from '../updates';

describe('UpdatesScreen', () => {
    it('renders the commit-history header', () => {
        render(<UpdatesScreen />);

        expect(screen.getByText('What Changed')).toBeTruthy();
        expect(screen.getByText(/Full app change history generated from repository commits/i)).toBeTruthy();
    });

    it('shows commit-derived summaries and touched files', () => {
        render(<UpdatesScreen />);

        expect(screen.getAllByText('Restore the preserved help and login guidance').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Add CashService logic, performance charts, and Playwright integration tests').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Change Summary').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Files Touched').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Updated app\/\(admin\)\/help\.tsx/i).length).toBeGreaterThan(0);
    });
});
