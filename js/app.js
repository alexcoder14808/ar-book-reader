import {db} from './supabase.js';
const $=x=>document.getElementById(x), show=id=>['auth','shelf','editor','reader'].forEach(x=>$(x).classList.toggle('hidden',x!==id));
let user=null,editing=null,books=[],chunks=[],spread=0,scene=null;
async function refresh(){const r=await db.from('books').select('*').order('created_at',{ascending:false});if(r.error){$('shelfMsg').textContent=r.error.message;return}books=r.data||[];$('books').innerHTML='';for(const b of books){let img='';if(b.cover_path){const s=await db.storage.from('book-covers').createSignedUrl(b.cover_path,3600);img=s.data?.signedUrl||''}const el=document.createElement('article');el.className='book';el.innerHTML=`<div class="cover">${img?`<img src="${img}" alt="">`:'📖'}</div><div class="info"><b>${esc(b.title)}</b><div>${esc(b.author||'')}</div></div><div class="actions"><button data-open>Read</button><button data-edit class="secondary">Edit</button></div>`;el.querySelector('[data-open]').onclick=()=>openReader(b);el.querySelector('[data-edit]').onclick=()=>edit(b);$('books').append(el)}}
const esc=s=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
$('login').onclick=async()=>{msg('authMsg','Logging in…');const r=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(r.error)msg('authMsg',r.error.message)};
$('signup').onclick=async()=>{msg('authMsg','Creating account…');const r=await db.auth.signUp({email:$('email').value.trim(),password:$('password').value});if(r.error)msg('authMsg',r.error.message);else msg('authMsg',r.data.session?'Account created.':'Check your email to confirm your account.')};
$('logout').onclick=()=>db.auth.signOut();$('add').onclick=()=>edit();$('back').onclick=$('cancel').onclick=()=>show('shelf');
function edit(b=null){editing=b;$('editHeading').textContent=b?'Edit book':'Add book';$('bookId').value=b?.id||'';$('title').value=b?.title||'';$('author').value=b?.author||'';$('description').value=b?.description||'';$('cover').value='';$('editMsg').textContent='';show('editor')}
$('save').onclick = async () => {
  try {
    msg('editMsg', 'Saving…');

    if (!user) {
      throw new Error('Not logged in');
    }

    const title = $('title').value.trim();

    if (!title) {
      throw new Error('Please enter a book title.');
    }

    const bookFile = $('bookFile').files[0];

    if (!editing && !bookFile) {
      throw new Error('Please choose an EPUB or PDF file.');
    }

    if (bookFile) {
      const name = bookFile.name.toLowerCase();

      if (!name.endsWith('.epub') && !name.endsWith('.pdf')) {
        throw new Error('Only EPUB and PDF files are allowed.');
      }
    }

    // Upload cover if one was selected.
    let coverPath = editing?.cover_path || null;

    const coverFile = $('cover').files[0];

    if (coverFile) {
      const ext = (coverFile.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      coverPath =
        `${user.id}/${crypto.randomUUID()}.${ext || 'jpg'}`;

      const upload = await db.storage
        .from('book-covers')
        .upload(coverPath, coverFile, {
          upsert: false,
          contentType: coverFile.type
        });

      if (upload.error) {
        throw upload.error;
      }
    }

    let bookId = editing?.id;

    // Create the database record first for a new book.
    if (!editing) {
      const result = await db
        .from('books')
        .insert({
          user_id: user.id,
          title,
          author: $('author').value.trim() || null,
          description: $('description').value.trim() || null,
          cover_path: coverPath,
          file_name: bookFile.name,
          file_type: bookFile.name.toLowerCase().endsWith('.pdf')
            ? 'pdf'
            : 'epub'
        })
        .select()
        .single();

      if (result.error) {
        throw result.error;
      }

      bookId = result.data.id;
    } else {
      // Update existing book metadata.
      const result = await db
        .from('books')
        .update({
          title,
          author: $('author').value.trim() || null,
          description: $('description').value.trim() || null,
          cover_path: coverPath
        })
        .eq('id', editing.id)
        .select()
        .single();

      if (result.error) {
        throw result.error;
      }
    }

    // Upload the ebook itself.
    if (bookFile) {
      const extension = bookFile.name
        .split('.')
        .pop()
        .toLowerCase();

      const filePath =
        `${user.id}/${bookId}/${crypto.randomUUID()}.${extension}`;

      const upload = await db.storage
        .from('book-files')
        .upload(filePath, bookFile, {
          upsert: false,
          contentType:
            extension === 'pdf'
              ? 'application/pdf'
              : 'application/epub+zip'
        });

      if (upload.error) {
        throw upload.error;
      }

      const result = await db
        .from('books')
        .update({
          file_path: filePath,
          file_name: bookFile.name,
          file_type: extension
        })
        .eq('id', bookId);

      if (result.error) {
        throw result.error;
      }
    }

    msg('editMsg', 'Book saved.');
    show('shelf');
    await refresh();

  } catch (e) {
    console.error(e);
    msg('editMsg', e.message || 'Could not save book.');
  }
};
$('local').onchange=e=>e.target.files[0]&&startLocal(e.target.files[0]);$('readerFile').onchange=e=>e.target.files[0]&&startLocal(e.target.files[0]);
async function openReader(b){$('readerTitle').textContent=b.title;$('readerFile').value='';show('reader');$('readerFile').click()}
async function startLocal(file){show('reader');$('status').textContent='Parsing locally…';try{chunks=file.name.toLowerCase().endsWith('.pdf')?await parsePdf(file):await parseEpub(file);spread=0;buildAR();$('status').textContent='Point camera at the Hiro marker. Swipe to turn pages.';update()}catch(e){$('status').textContent=e.message}}
function split(t,n=350){t=t.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();let a=[];while(t){let i=t.length<=n?t.length:t.lastIndexOf(' ',n);if(i<Math.floor(n*.6))i=Math.min(n,t.length);a.push(t.slice(0,i).trim());t=t.slice(i).trim()}return a.filter(Boolean)}
async function parseEpub(file) {
  try {
    if (!file || file.size === 0) {
      throw new Error('The EPUB file is empty.');
    }

    const buffer = await file.arrayBuffer();

    // A valid ZIP/EPUB normally starts with PK (0x50 0x4B).
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
      throw new Error(
        'This file is not being received as a valid EPUB/ZIP. Please download the EPUB file itself, not the Gutenberg webpage.'
      );
    }

    const zip = await JSZip.loadAsync(buffer);

    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      throw new Error('Invalid EPUB: META-INF/container.xml is missing.');
    }

    const containerText = await containerFile.async('text');
    const containerDoc = new DOMParser().parseFromString(
      containerText,
      'application/xml'
    );

    if (containerDoc.querySelector('parsererror')) {
      throw new Error('Invalid EPUB container.xml.');
    }

    const rootfile = containerDoc.querySelector('rootfile');
    const opfPath = rootfile?.getAttribute('full-path');

    if (!opfPath) {
      throw new Error('Invalid EPUB: OPF file could not be found.');
    }

    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new Error(`Invalid EPUB: OPF file not found: ${opfPath}`);
    }

    const opfText = await opfFile.async('text');
    const opfDoc = new DOMParser().parseFromString(
      opfText,
      'application/xml'
    );

    if (opfDoc.querySelector('parsererror')) {
      throw new Error('Invalid EPUB package document.');
    }

    const manifest = new Map();

    opfDoc.querySelectorAll('manifest > item').forEach(item => {
      const id = item.getAttribute('id');
      if (id) manifest.set(id, item);
    });

    const opfDirectory = opfPath.includes('/')
      ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
      : '';

    const textParts = [];

    for (const itemRef of opfDoc.querySelectorAll('spine > itemref')) {
      const idref = itemRef.getAttribute('idref');
      const item = manifest.get(idref);

      if (!item) continue;

      const mediaType = item.getAttribute('media-type') || '';

      if (
        !mediaType.includes('html') &&
        !mediaType.includes('xhtml')
      ) {
        continue;
      }

      const href = item.getAttribute('href');
      if (!href) continue;

      // EPUB hrefs can contain URL encoding.
      let decodedHref = href;
      try {
        decodedHref = decodeURIComponent(href);
      } catch (_) {}

      const path = opfDirectory + decodedHref;
      const entry = zip.file(path);

      if (!entry) {
        // Try the un-decoded path as a fallback.
        const fallback = zip.file(opfDirectory + href);
        if (!fallback) continue;

        const html = await fallback.async('text');
        const doc = new DOMParser().parseFromString(html, 'text/html');

        doc.querySelectorAll('script, style, nav').forEach(el => el.remove());

        if (doc.body?.innerText) {
          textParts.push(doc.body.innerText);
        }

        continue;
      }

      const html = await entry.async('text');
      const doc = new DOMParser().parseFromString(html, 'text/html');

      doc.querySelectorAll('script, style, nav').forEach(el => el.remove());

      if (doc.body?.innerText) {
        textParts.push(doc.body.innerText);
      }
    }

    const text = textParts.join('\n\n');
    const result = split(text);

    if (!result.length) {
      throw new Error('The EPUB opened successfully, but no readable text was found.');
    }

    return result;

  } catch (error) {
    console.error('EPUB parsing error:', error);

    if (
      error?.message?.toLowerCase().includes('end of central directory')
    ) {
      throw new Error(
        'The EPUB ZIP container could not be read. Make sure you downloaded the EPUB3 file itself from Project Gutenberg.'
      );
    }

    throw error;
  }
}
async function parsePdf(f){const pdf=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');const p=await pdf.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise,out=[];for(let i=1;i<=p.numPages;i++){let pg=await p.getPage(i),c=await pg.getTextContent();out.push(c.items.map(x=>x.str).join(' '))}return split(out.join('\n\n'))}
function buildAR(){if(scene){scene.remove()}$('ar').innerHTML='';scene=document.createElement('a-scene');scene.setAttribute('embedded','');scene.setAttribute('vr-mode-ui','enabled:false');scene.setAttribute('renderer','colorManagement:true;precision:mediump');scene.setAttribute('arjs','sourceType: webcam; facingMode: environment; debugUIEnabled: false;');let marker=document.createElement('a-marker');marker.setAttribute('preset','hiro');let book=document.createElement('a-entity');let spine=document.createElement('a-box');spine.setAttribute('position','0 0.05 0');spine.setAttribute('width','.06');spine.setAttribute('height','.05');spine.setAttribute('depth','.78');spine.setAttribute('color','#252a32');book.append(spine);for(const x of [-.29,.29]){let p=document.createElement('a-box');p.setAttribute('position',`${x} .02 0`);p.setAttribute('width','.52');p.setAttribute('height','.012');p.setAttribute('depth','.78');p.setAttribute('color','#f7f4eb');book.append(p)};for(const x of [-.29,.29]){let t=document.createElement('a-text');t.setAttribute('id',x<0?'leftText':'rightText');t.setAttribute('position',`${x} .031 0`);t.setAttribute('rotation','-90 0 0');t.setAttribute('width','.43');t.setAttribute('height','.65');t.setAttribute('color','#111');t.setAttribute('align','left');t.setAttribute('baseline','top');t.setAttribute('wrap-count','38');book.append(t)}marker.append(book);scene.append(marker);let cam=document.createElement('a-entity');cam.setAttribute('camera','');cam.setAttribute('look-controls-enabled','false');scene.append(cam);$('ar').append(scene)}
function update(){$('leftText')?.setAttribute('value',chunks[spread*2]||'');$('rightText')?.setAttribute('value',chunks[spread*2+1]||'');$('pages').textContent=`${spread*2+1}–${Math.min(chunks.length,spread*2+2)} / ${chunks.length}`}
$('prev').onclick=()=>{spread=Math.max(0,spread-1);update()};$('next').onclick=()=>{spread=Math.min(Math.ceil(chunks.length/2)-1,spread+1);update()};$('close').onclick=()=>{if(scene)scene.remove();scene=null;show('shelf')};$('help').onclick=()=>$('modal').classList.remove('hidden');$('modalClose').onclick=()=>$('modal').classList.add('hidden');
let sx=null;$('reader').addEventListener('touchstart',e=>{if(e.touches.length===1)sx=e.touches[0].clientX},{passive:true});$('reader').addEventListener('touchend',e=>{if(sx==null)return;let dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>45){spread=Math.max(0,Math.min(Math.ceil(chunks.length/2)-1,spread+(dx<0?1:-1)));update()}sx=null},{passive:true});
function msg(id,t){$(id).textContent=t}db.auth.onAuthStateChange(async(_e,s)=>{user=s?.user||null;if(user){show('shelf');await refresh()}else show('auth')});let s=(await db.auth.getSession()).data.session;user=s?.user||null;if(user){show('shelf');await refresh()}else show('auth');
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(console.warn);
