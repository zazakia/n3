import React from 'react';
import { render, screen } from '@testing-library/react-native';
import UpdatesScreen from '../updates';

// Mock APP_UPDATES to make tests resilient to environment git history
jest.mock('../../../../src/constants/appUpdates', () => {
    const actual = jest.requireActual('../../../../src/constants/appUpdates');
    return {
        ...actual,
        APP_UPDATES: [
            {
                id: 'test-commit-1',
                version: 'v1.0.0',
                date: '2026-05-12',
                title: 'Initial test commit',
                category: 'technical',
                icon: 'code',
                summary: 'Initial commit summary',
                changes: ['Initial commit change'],
                codeChanges: ['Updated test.file']
            }
        ]
    };
});

describe('UpdatesScreen', () => {
    it('renders the commit-history header', () => {
        render(<UpdatesScreen />);

        expect(screen.getByText('What Changed')).toBeTruthy();
        expect(screen.getByText(/Full app change history generated from repository commits/i)).toBeTruthy();
    });

    it('shows commit-derived summaries and touched files', () => {
        render(<UpdatesScreen />);

        expect(screen.getAllByText('Initial test commit').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Initial commit summary').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Change Summary').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Files Touched').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Updated test\.file/i).length).toBeGreaterThan(0);
    });
});
