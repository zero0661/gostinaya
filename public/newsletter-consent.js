/* Install only together with the consent backend and published legal documents. */
(() => {
 const version='newsletter-2026-10-07-v1';
 const start=()=>{
  document.querySelectorAll('form.after-login-subscribe').forEach(form=>{
   if(form.querySelector('[name="consent"]'))return;
   const en=form.dataset.language==='en';
   const label=document.createElement('label');label.className='after-login-consent';
   label.style.cssText='display:flex;align-items:flex-start;gap:10px;margin:18px 0;font-size:15px;line-height:1.6;text-align:left';
   const check=document.createElement('input');check.type='checkbox';check.name='consent';check.required=true;check.style.cssText='width:18px;height:18px;flex:0 0 18px;margin-top:4px';
   const text=document.createElement('span');text.append(document.createTextNode(en?'I consent to the processing of my data under the ':'Даю согласие на обработку моих данных на условиях '));
   const link=document.createElement('a');link.href='/gostinaya/newsletter/consent?lang='+(en?'en':'ru');link.target='_blank';link.rel='noopener';link.textContent=en?'separate consent':'отдельного согласия';text.append(link);label.append(check,text);
   const row=form.querySelector('.pl-signup-row,.after-login-subscribe__row'); if(row)row.after(label);else form.prepend(label);
   const policy=document.createElement('p');policy.style.cssText='font-size:15px;text-align:left;margin:10px 0';const a=document.createElement('a');a.href='/gostinaya/newsletter/privacy?lang='+(en?'en':'ru');a.target='_blank';a.rel='noopener';a.textContent=en?'Data processing policy':'Политика обработки персональных данных';policy.append(a);label.after(policy);
   const state=(type,message)=>{['loading','success','error'].forEach(t=>{form.classList.remove('is-'+t);const p=form.querySelector('.after-login-subscribe__state--'+t);if(p){p.hidden=t!==type;p.style.display=t===type?'block':'none';if(t===type)p.textContent=message;}});};
   form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopImmediatePropagation();if(!form.reportValidity())return;
    if(form.dataset.consentSending==='1')return;form.dataset.consentSending='1';
    const button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
    state('loading',en?'Sending…':'Отправляем…');
    try{
     const response=await fetch('/gostinaya/api/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.querySelector('[name="email"]').value,language:en?'en':'ru',returnTo:location.pathname+location.search+location.hash,consent:check.checked,consentVersion:version})});
     const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'delivery-failed');
     state('success',result.status==='already-subscribed'?(en?'You are already subscribed.':'Вы уже подписаны.'):(en?'Check your inbox and confirm your subscription.':'Проверьте почту и подтвердите подписку.'));
    }catch(error){state('error',error.message==='consent-required'?(en?'Please accept the current consent document.':'Подтвердите согласие актуальной редакции.'):(en?'Could not send the email. Please try again.':'Не удалось отправить письмо. Попробуйте ещё раз.'));}
    finally{form.dataset.consentSending='0';if(button)button.disabled=false;}
   },true);
  });
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
