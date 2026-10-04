import { createAccountStore } from './account-store.mjs';

async function makeAdmin() {
  const username = process.argv[2];
  if (!username) {
    console.error('Sử dụng: node make-admin.mjs <tên_đăng_nhập>');
    process.exit(1);
  }

  const store = await createAccountStore({
    dataDir: 'data',
    databaseUrl: process.env.DATABASE_URL
  });

  const account = await store.findByUsername(username.toLowerCase());
  if (!account) {
    console.error(`Không tìm thấy tài khoản: ${username}`);
    await store.close();
    process.exit(1);
  }

  // Update account in DB manually
  // Using store.command or just store directly. Wait, store doesn't have an update account function exposed other than saveProfile.
  // Actually, we can use store.command to run a raw transaction/write
  await store.command({
    actorId: account.id,
    requestId: 'make-admin-' + Date.now(),
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    expectedRevision: account.profileRevision || 0,
    run: async (records) => {
      const rec = records.get(account.id);
      rec.isAdmin = true;
      return { ok: true, admin: true };
    }
  });

  console.log(`Đã cấp quyền Admin cho tài khoản: ${username}`);
  await store.close();
}

makeAdmin().catch(console.error);
