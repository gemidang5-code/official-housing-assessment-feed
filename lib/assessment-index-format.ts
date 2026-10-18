// Official nationwide public data only; never customer or debt data.
export const assessmentColumns=['기준연도','기준월','법정동코드','도로명주소','시도','시군구','읍면','동리','특수지코드','본번','부번','특수지명','단지명','동명','호명','전용면적','공시가격','단지코드','동코드','호코드','건축물대장PK'];
export type AssessmentIndexRow=[string,string,string,string,string,string,string,string,string,string,string,string,string];
export const assessmentRegionKey=(s:string)=>s.normalize('NFKC').replace(/^서울특별시|^서울시/,'서울').replace(/^경기도/,'경기').replace(/^충청남도/,'충남').replace(/^충청북도/,'충북').replace(/^경상남도/,'경남').replace(/^경상북도/,'경북').replace(/^전라남도/,'전남').replace(/^전북특별자치도|^전라북도/,'전북').replace(/^강원특별자치도|^강원도/,'강원').replace(/^제주특별자치도|^제주도/,'제주').replace(/^(부산|대구|인천|광주|대전|울산)광역시/,'$1').replace(/(\S+)시\s+([가-힣]+구)/u,'$1$2').replace(/\s/g,'');
export function assessmentCsvFields(line:string){
 line=line.replace(/^\uFEFF/,'').replace(/\r$/,'');
 if(!line.startsWith('"')||!line.endsWith('"'))throw new Error('공식 공시 원본 CSV 인용 형식 변경');
 const fields=line.slice(1,-1).split('","');if(fields.length!==21||fields.some(x=>x.includes('"')))throw new Error('공식 공시 원본 CSV 열 구조 변경');return fields;
}
export function assessmentCompactRow(fields:string[],year:string):AssessmentIndexRow|null{
 const f=fields;if(f[0]!==year||f[1]!=='01'||!/^\d{10}$/.test(f[2]))throw new Error('공시 원본 기준연도·월·법정동코드 상충');
 // Blocks/temporary parcels are not silently converted to an ordinary lot.
 if(!['0','1'].includes(f[8])||!/^\d{1,4}$/.test(f[9])||!/^\d{1,4}$/.test(f[10])||Number(f[9])<=0||!Number.isFinite(Number(f[15]))||Number(f[15])<=0||!/^\d+$/.test(f[16])||Number(f[16])<=0)return null;
 const region=[f[4],f[5],f[6],f[7]].filter(Boolean).join(' ');
 return [f[2],f[8],String(Number(f[9])),String(Number(f[10])),f[13],f[14],f[15],f[16],f[17],f[12],f[20],region,f[1]];
}
export const assessmentShard=(code:string,bun:string,ji:string)=>`${code.slice(0,5)}-${(Number(bun)*31+Number(ji))%16}`;
export type AssessmentIndexPart={offset:number;length:number;sha256:string;rows:number};
export type AssessmentIndexManifest={version:1;year:string;asOf:string;sourceUrl:string;sourceSha256:string;sourceRows:number;indexedRows:number;createdAt:string;regions:Record<string,string[]>;shards:Record<string,AssessmentIndexPart[]>};
export function assessmentIndexRows(rows:AssessmentIndexRow[],year:string){return rows.map(r=>({pnu:`${r[0]}${r[1]==='1'?'2':'1'}${r[2].padStart(4,'0')}${r[3].padStart(4,'0')}`,ldCodeNm:r[11],mnnmSlno:`${r[1]==='1'?'산':''}${r[2]}${Number(r[3])?'-'+r[3]:''}`,stdrYear:year,stdrMt:r[12],dongNm:r[4],hoNm:r[5],prvuseAr:r[6],pblntfPc:r[7],aphusCode:r[8],aphusNm:r[9],bildRegstrEsntlNo:r[10]}))}
