import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';import {spawnSync} from 'node:child_process';
import {officialAssessmentSource,buildAssessmentIndex} from './build-assessment-index.mjs';
const repo=process.env.GITHUB_REPOSITORY;if(repo!=='gemidang5-code/official-housing-assessment-feed')throw Error('승인된 공개 공시자료 전용 저장소에서만 실행합니다.');
const token=process.env.GH_TOKEN;if(!token)throw Error('GitHub 자동 실행 토큰 필요');
const headers={authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'};
const call=async(method,url,body)=>{const r=await fetch('https://api.github.com'+url,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(`GitHub 작업 오류 ${r.status}`);return r.status===204?null:r.json()};
const info=await call('GET',`/repos/${repo}`);if(info.private!==false)throw Error('유료 실행 방지를 위해 비공개 저장소에서는 중단합니다.');
const source=await officialAssessmentSource(),tag='official-assessment-index',out='outputs/public-assessment-feed';await fsp.mkdir(out,{recursive:true});
let previous=null;try{const r=await fetch(`https://github.com/${repo}/releases/download/${tag}/current.json`);if(r.ok)previous=await r.json()}catch{}
const gh=args=>{const p=spawnSync('gh',args,{stdio:'inherit',env:process.env});if(p.status!==0)throw Error('공개 원본 배포 실패')};
if(previous?.sourceSha256!==source.sha){
 const zip=path.join(out,'source.zip'),r=await fetch(source.download);if(!r.ok||!r.body||Number(r.headers.get('content-length'))>300_000_000)throw Error('공식 원본 다운로드 확인 필요');await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(zip));
 const summary=await buildAssessmentIndex(zip,out,source);await fsp.rename(path.join(out,'index.bin'),path.join(out,summary.file));
 let releaseExists=true;try{await call('GET',`/repos/${repo}/releases/tags/${tag}`)}catch{releaseExists=false}
 if(!releaseExists)gh(['release','create',tag,'--title','공식 공동주택 공시가격 자동조회 색인','--notes',`국토교통부 공개 원본 파생 색인. 이용허락범위 제한 없음. 원출처: ${source.sourceUrl}\n고객자료·비밀값 없음. 전체 CSV SHA-256과 건수 일치 후에만 발행합니다.`,'--target',process.env.GITHUB_SHA]);
 gh(['release','upload',tag,path.join(out,summary.file),'--clobber']);gh(['release','upload',tag,path.join(out,'current.json'),'--clobber']);
}
// Record a real source check on a dedicated branch; never change product main.
// Monthly verified source activity also avoids depending on human code commits.
const branch='codex/official-assessment-feed',ref=`/repos/${repo}/git/refs/heads/${branch}`;
try{await call('GET',ref)}catch{await call('POST',`/repos/${repo}/git/refs`,{ref:`refs/heads/${branch}`,sha:process.env.GITHUB_SHA})}
const endpoint=`/repos/${repo}/contents/official-assessment-source-check.json`;let sha;try{sha=(await call('GET',endpoint+'?ref='+encodeURIComponent(branch))).sha}catch{}
const record={checkedAt:new Date().toISOString(),sourceUrl:source.sourceUrl,sourceSha256:source.sha,sourceRows:source.rows,year:source.year,kind:'official-public-data-only'};
await call('PUT',endpoint,{message:'Record verified official assessment source check',branch,...(sha?{sha}:{}),content:Buffer.from(JSON.stringify(record,null,2)+'\n').toString('base64')});console.log(JSON.stringify({sourceCheck:true,year:source.year,changed:previous?.sourceSha256!==source.sha}));
