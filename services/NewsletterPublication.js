// Delivery is per published post and does not depend on pairing Lounge discussions.
export function newsletterPublication(post, appUrl = 'https://milenin.pro') {
  if (!post?.id || !post?.title || post.status !== 'published') return null;
  const url = new URL(post.url);
  if (url.origin !== new URL(appUrl).origin) throw new Error('Foreign publication URL');
  const en = url.pathname.startsWith('/en/');
  const legacyDeliveryKeys = (post.tags || [])
    .map(tag => tag.name)
    .filter(name => /^#discussion-[a-z0-9][a-z0-9-]*$/i.test(name))
    .map(name => `discussion:${name.toLowerCase()}`);
  return {
    deliveryKey: `post:${post.id}`, legacyDeliveryKeys,
    title: post.title,
    titleRu: en ? null : post.title,
    titleEn: en ? post.title : null,
    urlRu: en ? null : post.url,
    urlEn: en ? post.url : null
  };
}
