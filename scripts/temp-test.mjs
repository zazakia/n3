import pg from 'pg';

async function test() {
    const client = new pg.Client({
        host: '127.0.0.1',
        port: 55322,
        database: 'postgres',
        user: 'postgres',
        password: 'postgres',
    });
    await client.connect();
    
    // Check tables
    const res = await client.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`);
    console.log(res.rows);
    
    const res2 = await client.query(`SELECT count(*) FROM app_loans`);
    console.log(`Loans: `, res2.rows[0]);
    
    await client.end();
}
test();
