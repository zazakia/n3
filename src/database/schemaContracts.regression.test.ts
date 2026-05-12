import { mySchema } from './schema';
import fs from 'fs';
import path from 'path';

function tableColumns(tableName: string) {
    const table = (mySchema as any).tables[tableName];
    return Object.fromEntries(table.columnArray.map((column: any) => [column.name, column]));
}

describe('local/remote schema regression contracts', () => {
    it('keeps local Watermelon payments aligned with remote app_payments.borrower_id', () => {
        const columns = tableColumns('payments');

        expect(columns.borrower_id).toEqual(expect.objectContaining({
            name: 'borrower_id',
            type: 'string',
            isOptional: true,
        }));
    });

    it('keeps generated Supabase types aware of app_payments.borrower_id', () => {
        const types = fs.readFileSync(path.join(process.cwd(), 'src', 'database', 'types.ts'), 'utf8');
        const appPaymentsBlock = types.match(/app_payments:\s*{[\s\S]*?Relationships:\s*\[\]/)?.[0] ?? '';

        expect(appPaymentsBlock).toContain('borrower_id: string');
        expect(appPaymentsBlock).toContain('borrower_id?: string');
    });
});
