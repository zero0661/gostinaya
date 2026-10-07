export async function eraseNewsletterData({email, apply=false, verifiedRequest=false, ghost, records, ledger}) {
 const normalized=String(email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254) throw Error('INVALID_EMAIL');
 const plan=await records.count(normalized);
 if(!apply) return {applied:false,plan};
 if(!verifiedRequest) throw Error('VERIFIED_REQUEST_REQUIRED');
 // Preserve the restore instruction before changing either data store.
 await ledger.record(normalized);
 await records.revoke(normalized);
 await ghost.deleteFreeMemberByEmail(normalized);
 await records.erase(normalized);
 return {applied:true,plan};
}
