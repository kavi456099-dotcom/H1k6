import { pgTable, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
export const images = pgTable('images', {
 id: text().primaryKey(), ownerId: text('owner_id').notNull(), name: text().notNull(), type: text().notNull(), size: integer().notNull(), favorite: boolean().notNull().default(false), createdAt: timestamp('created_at').notNull().defaultNow(),
}, table => [index('images_owner_idx').on(table.ownerId)]);
