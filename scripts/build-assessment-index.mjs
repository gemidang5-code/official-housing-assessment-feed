// Build a complete, reproducible public-data index. No application secrets/input.
import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {assessmentCsvFields,assessmentColumns,assessmentCompactRow,assessmentRegionKey,assessmentShard} from '../lib/assessment-index-format.ts';
export async function officialAssessmentSource(){
 const sourceUrl='https://www.data.go.kr/data/3073746/fileData.do',html=await(await fetch(sourceUrl)).text(),detail=html.match(/fn_fileDataDown\('3073746',\s*'(uddi:[a-f0-9-]{36})'/)?.[1],year=html.match(/공시가격 정보_(20\d{2})0101/)?.[1],sha=html.match(/SHA-256[^]*?([A-Fa-f0-9]{64})/)?.[1]?.toLowerCase(),rows=html.match(/자료건수\s*:\s*([\d,]+)건/)?.[1];
 if(!detail||!year||!sha||!rows)throw Error('공식 원본 설명·해시·건수 형식 변경. 자동 대체하지 않습니다.');
 const meta=await(await fetch('https://www.data.go.kr/tcs/dss/selectFileDataDownload.do',{method:'POST',body:new URLSearchParams({publicDataPk:'3073746',publicDataDetailPk:detail,atchFileId:'',fileDetailSn:'1',publicDataTyCode:'PR0051'})})).json();
 if(meta.status!==true||meta.dataSetFileDetailInfo?.pchrgAt!=='N'||meta.dataSetFileDetailInfo?.useScopeCode!=='COEX07'||!/^FILE_\d+$/.test(meta.atchFileId))throw Error('공식 무료·이용조건 또는 원본 파일 식별 확인 필요');
 const limit=await(await fetch('https://www.data.go.kr/cmm/cmm/check-limit.json',{method:'POST',body:new URLSearchParams({atchFileId:meta.atchFileId,fileDetailSn:String(meta.fileDetailSn)})})).json();
 if(limit.needCaptcha!==false)throw Error('공식 다운로드에 사람 확인이 필요합니다. CAPTCHA를 우회하지 않고 이전 원본을 유지합니다.');
 return {sourceUrl,year,sha,rows:Number(rows.replace(/,/g,'')),download:`https://www.data.go.kr/cmm/cmm/fileDownload.do?${new URLSearchParams({atchFileId:meta.atchFileId,fileDetailSn:String(meta.fileDetailSn),dataNm:'official-assessment'})}`};
}
export function csvEntry(zipPath){
 const fd=fs.openSync(zipPath,'r');try{const size=fs.fstatSync(fd).size,tail=Buffer.alloc(Math.min(size,65557));fs.readSync(fd,tail,0,tail.length,size-tail.length);let end=-1;for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50){end=i;break}if(end<0)throw Error('공식 ZIP footer 누락');
  const count=tail.readUInt16LE(end+10),offset=tail.readUInt32LE(end+16),length=tail.readUInt32LE(end+12);if(count>100||length>1_000_000||offset+length>size)throw Error('공식 ZIP 구조 확인 필요');const central=Buffer.alloc(length);fs.readSync(fd,central,0,length,offset);const entries=[];let p=0;
  for(let i=0;i<count;i++){if(central.readUInt32LE(p)!==0x02014b50)throw Error('공식 ZIP central directory 오류');const n=central.readUInt16LE(p+28),extra=central.readUInt16LE(p+30),comment=central.readUInt16LE(p+32),name=central.subarray(p+46,p+46+n).toString('utf8');entries.push({name,method:central.readUInt16LE(p+10),compressed:central.readUInt32LE(p+20),uncompressed:central.readUInt32LE(p+24),local:central.readUInt32LE(p+42)});p+=46+n+extra+comment}
  const selected=entries.filter(x=>x.name.toLowerCase().endsWith('.csv')).sort((a,b)=>b.uncompressed-a.uncompressed)[0];if(!selected||selected.method!==8||selected.compressed>300_000_000||selected.uncompressed>4_294_967_294)throw Error('지원 범위 밖의 공식 CSV/ZIP 구조');const head=Buffer.alloc(30);fs.readSync(fd,head,0,30,selected.local);const start=selected.local+30+head.readUInt16LE(26)+head.readUInt16LE(28);return {...selected,start};
 }finally{fs.closeSync(fd)}
}
export async function coalesceAssessmentParts(out,parts,shards){
 const files=new Map();let position=0;for(const name of parts){files.set(position,name);position+=(await fsp.stat(path.join(out,name))).size}
 const combined=[],result={};let offset=0;
 for(const [id,fragments] of Object.entries(shards)){
  let chunks=[],size=0,rows=0;
  const flush=async()=>{if(!rows)return;const compressed=zlib.gzipSync(Buffer.concat(chunks)),name=`merged-${combined.length}.gz`,part={offset,length:compressed.length,sha256:crypto.createHash('sha256').update(compressed).digest('hex'),rows};offset+=compressed.length;(result[id]??=[]).push(part);combined.push(name);await fsp.writeFile(path.join(out,name),compressed);chunks=[];size=0;rows=0};
  for(const fragment of fragments){const name=files.get(fragment.offset);if(!name)throw Error('색인 조각 위치 불일치');const compressed=await fsp.readFile(path.join(out,name));if(crypto.createHash('sha256').update(compressed).digest('hex')!==fragment.sha256)throw Error('색인 조각 해시 불일치');const raw=zlib.gunzipSync(compressed);chunks.push(raw);size+=raw.length;rows+=fragment.rows;if(size>=1_000_000)await flush()}
  await flush();
 }
 return {parts:combined,shards:result};
}
export async function buildAssessmentIndex(zipPath,out,source){
 await fsp.mkdir(out,{recursive:true});const entry=csvEntry(zipPath),hash=crypto.createHash('sha256'),raw=fs.createReadStream(zipPath,{start:entry.start,end:entry.start+entry.compressed-1}),inflate=zlib.createInflateRaw();raw.pipe(inflate);inflate.on('data',x=>hash.update(x));const rl=readline.createInterface({input:inflate,crlfDelay:Infinity});
 const regions={},groups=new Map(),parts=[],shards={};let rowCount=0,indexedRows=0,buffered=0,offset=0,header=false;
 const flush=async id=>{const group=groups.get(id);if(!group?.rows.length)return;groups.delete(id);buffered-=group.size;const compressed=zlib.gzipSync(group.rows.join('\n')+'\n'),name=`part-${parts.length}.gz`,part={offset,length:compressed.length,sha256:crypto.createHash('sha256').update(compressed).digest('hex'),rows:group.rows.length};offset+=compressed.length;(shards[id]??=[]).push(part);parts.push(name);await fsp.writeFile(path.join(out,name),compressed)};
 for await(const line of rl){if(!line)continue;const fields=assessmentCsvFields(line);if(!header){if(JSON.stringify(fields)!==JSON.stringify(assessmentColumns))throw Error('공식 CSV 헤더 변경');header=true;continue}rowCount++;const row=assessmentCompactRow(fields,source.year);if(!row)continue;indexedRows++;const region=assessmentRegionKey(row[11]);(regions[region]??=new Set()).add(row[0]);const id=assessmentShard(row[0],row[2],row[3]),text=JSON.stringify(row),group=groups.get(id)||{rows:[],size:0};group.rows.push(text);group.size+=text.length*2;buffered+=text.length*2;groups.set(id,group);
  if(group.size>1_000_000)await flush(id);else if(buffered>8_000_000){let largest='';for(const [k,v] of groups)if(!largest||v.size>groups.get(largest).size)largest=k;await flush(largest)}
  if(rowCount%1_000_000===0)console.log(JSON.stringify({scanned:rowCount,indexed:indexedRows}));
 }
 const digest=hash.digest('hex');if(rowCount!==source.rows||digest!==source.sha.toLowerCase())throw Error('공식 CSV 전체 건수 또는 SHA-256 불일치. 색인을 공개하지 않습니다.');for(const id of groups.keys())await flush(id);
 const merged=await coalesceAssessmentParts(out,parts,shards);
 const manifest={version:1,year:source.year,asOf:`${source.year}-01-01`,sourceUrl:source.sourceUrl,sourceSha256:digest,sourceRows:rowCount,indexedRows,createdAt:new Date().toISOString(),regions:Object.fromEntries(Object.entries(regions).map(([k,v])=>[k,[...v]])),shards:merged.shards},json=Buffer.from(JSON.stringify(manifest)),prefix=Buffer.alloc(12);prefix.write('ASSESS01');prefix.writeUInt32LE(json.length,8);
 const target=path.join(out,'index.bin'),stream=fs.createWriteStream(target);stream.write(prefix);stream.write(json);for(const name of merged.parts)for await(const chunk of fs.createReadStream(path.join(out,name)))if(!stream.write(chunk))await new Promise(r=>stream.once('drain',r));await new Promise((resolve,reject)=>{stream.on('error',reject);stream.end(resolve)});
 const finalHash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(target))finalHash.update(chunk);const summary={version:1,year:source.year,asOf:manifest.asOf,sourceUrl:source.sourceUrl,sourceSha256:digest,sourceRows:rowCount,indexedRows,size:fs.statSync(target).size,sha256:finalHash.digest('hex'),file:`assessment-${digest}.bin`};await fsp.writeFile(path.join(out,'current.json'),JSON.stringify(summary));console.log(JSON.stringify(summary));return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),zip=args[0]||'outputs/assessment-2026.zip',out=args[1]||'outputs/assessment-index';const source=await officialAssessmentSource();await buildAssessmentIndex(zip,out,source);}
