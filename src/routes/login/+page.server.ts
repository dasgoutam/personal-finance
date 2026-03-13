import { fail, redirect } from '@sveltejs/kit';
import { verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { lucia } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/dashboard');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = data.get('username');
		const password = data.get('password');

		if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
			return fail(400, { error: 'Username and password are required.', username: '' });
		}

		const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

		if (!user) {
			// Constant-time response to prevent username enumeration
			return fail(400, { error: 'Invalid username or password.', username });
		}

		const validPassword = await verify(user.hashedPassword, password, {
			memoryCost: 19456,
			timeCost: 2,
			outputLen: 32,
			parallelism: 1
		});

		if (!validPassword) {
			return fail(400, { error: 'Invalid username or password.', username });
		}

		const session = await lucia.createSession(user.id, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		redirect(302, '/dashboard');
	}
};
