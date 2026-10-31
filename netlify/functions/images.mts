import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';
import { drizzle } from 'drizzle-orm/netlify-db';
import { and, eq, desc } from 'drizzle-orm';
import { images } from '../../db/schema.js';
import type { Config } from '@netlify/functions';
export default async (req: Request) => {
 const user = await getUser();
 const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const json = (data: unknown, status = 200) => Response.json(data,{status,headers});
 if (!user) return json({error:'Please log in to access your images.'},401);
 if (!['GET','POST','PATCH','DELETE'].includes(req.method)) return json({error:'Method not allowed'},405);
 if (req.method !== 'GET' && req.headers.get('origin') !== new URL(req.url).origin) return json({error:'Invalid request origin'},403);
 try {
 const db = drizzle(); const store = getStore('private-images');
 const id = new URL(req.url).searchParams.get('id');
 const owned = id ? and(eq(images.id,id),eq(images.ownerId,user.id)) : eq(images.ownerId,user.id);
 if (req.method === 'GET' && !id) return json(await db.select().from(images).where(owned).orderBy(desc(images.createdAt)));
 if (req.method === 'POST') {
  const form = await req.formData(); const file = form.get('image');
  if (!(file instanceof File) || !['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) return json({error:'Choose a JPG, PNG, WebP, or GIF image.'},400);
  if (!file.size || file.size > 4 * 1024 * 1024) return json({error:'Images must be under 4 MB.'},400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 : file.type === 'image/png' ? bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10' : file.type === 'image/gif' ? new TextDecoder().decode(bytes.slice(0,6)).match(/^GIF8[79]a$/) : new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if(!valid) return json({error:'This file is not a valid supported image.'},400);
  const imageId = crypto.randomUUID(); const key = `${user.id}/${imageId}`;
  await store.set(key,bytes.buffer);
  try {const [image] = await db.insert(images).values({id:imageId,ownerId:user.id,name:file.name.slice(0,200),type:file.type,size:file.size}).returning();return json(image,201);} catch(error){await store.delete(key);throw error;}
 }
 if (!id) return json({error:'Image ID required'},400);
 const [image] = await db.select().from(images).where(owned);
 if (!image) return json({error:'Image not found'},404);
 if (req.method === 'GET') {
  const data = await store.get(`${user.id}/${id}`,{type:'arrayBuffer'});
  if (!data) return json({error:'Image not found'},404);
  return new Response(data,{headers:{...headers,'Content-Type':image.type,'Content-Disposition':`${new URL(req.url).searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(image.name)}`}});
 }
 if (req.method === 'PATCH') {const body = await req.json();if(typeof body.favorite!=='boolean') return json({error:'Invalid favorite value'},400);const [updated] = await db.update(images).set({favorite:body.favorite}).where(owned).returning();return json(updated);}
 await store.delete(`${user.id}/${id}`);await db.delete(images).where(owned);return json({ok:true});
 } catch {return json({error:'Your images could not be accessed. Please try again.'},500);}
};
export const config: Config = {path:'/api/images'};
