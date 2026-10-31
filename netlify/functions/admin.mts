import { getUser, admin } from '@netlify/identity';
import { drizzle } from 'drizzle-orm/netlify-db';
import { eq, desc } from 'drizzle-orm';
import { getStore } from '@netlify/blobs';
import { images } from '../../db/schema.js';
import type { Config } from '@netlify/functions';

export default async (req: Request) => {
 const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const json = (data: unknown, status = 200) => Response.json(data,{status,headers});
 const session = await getUser();
 if (!session) return json({error:'Please sign in.'},401);
 if (!['GET','PATCH','DELETE'].includes(req.method)) return json({error:'Method not allowed.'},405);
 if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) return json({error:'Invalid request origin.'},403);
 try {
  // Read current server-controlled roles so removed administrators lose access immediately.
  const caller = await admin.getUser(session.id);
  if (!caller.roles?.includes('admin')) return json({error:'An administrator role is required. Ask the site owner to assign it in Netlify Identity, then sign in again.'},403);
  const url = new URL(req.url), resource = url.searchParams.get('resource'), id = url.searchParams.get('id');
  if (!resource) return json({ok:true});
  const db = drizzle();
  if (resource === 'users') {
   if (req.method === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const users = await admin.listUsers({page,perPage:50});
    return json(users.map(u=>({id:u.id,email:u.email,name:u.name||u.userMetadata?.full_name,roles:u.roles||[],confirmed:!!u.confirmedAt,createdAt:u.createdAt})));
   }
   if (!id) return json({error:'User ID required.'},400);
   if (id === caller.id) return json({error:'You cannot delete your own account or change your own admin role.'},400);
   if (req.method === 'PATCH') {
    const body = await req.json();
    if (typeof body.admin !== 'boolean') return json({error:'Invalid role.'},400);
    const target = await admin.getUser(id);
    const roles = (target.roles||[]).filter(r=>r!=='admin');
    if (body.admin) roles.push('admin');
    await admin.updateUser(id,{app_metadata:{...target.appMetadata,roles}});
    return json({ok:true});
   }
   const owned = await db.select({id:images.id}).from(images).where(eq(images.ownerId,id)).limit(1);
   if (owned.length) return json({error:'Remove this user’s images before deleting their account.'},409);
   await admin.deleteUser(id);
   return json({ok:true});
  }
  if (resource !== 'images') return json({error:'Unknown resource.'},400);
  if (req.method === 'GET' && !id) return json(await db.select().from(images).orderBy(desc(images.createdAt)));
  if (!id) return json({error:'Image ID required.'},400);
  const [image] = await db.select().from(images).where(eq(images.id,id));
  if (!image) return json({error:'Image not found.'},404);
  const store = getStore('private-images');
  if (req.method === 'GET') {
   const data = await store.get(`${image.ownerId}/${id}`,{type:'arrayBuffer'});
   if (!data) return json({error:'Image not found.'},404);
   return new Response(data,{headers:{...headers,'Content-Type':image.type,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(image.name)}`}});
  }
  if (req.method !== 'DELETE') return json({error:'Method not allowed.'},405);
  await store.delete(`${image.ownerId}/${id}`);
  await db.delete(images).where(eq(images.id,id));
  return json({ok:true});
 } catch { return json({error:'Admin request failed. Please try again.'},500); }
};
export const config: Config = {path:'/api/admin'};
