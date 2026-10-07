import { invariant } from '../../core/errors.mjs';

const EICAR='X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export function createBaselineEngineeringScanner() {
  return Object.freeze({
    name:'syntha-baseline-integrity',
    version:'1.0.0',
    assurance:'integrity_only',
    productionMalwareScanner:false,
    async scan({ source, blob }) {
      invariant(source?.id && blob?.content instanceof Uint8Array,'ENGINEERING_SCAN_INPUT_INVALID','Source and bytes are required');
      invariant(source.contentHash===blob.contentHash,'ENGINEERING_SCAN_HASH_MISMATCH','Source bytes do not match source hash');
      const head=new TextDecoder('latin1').decode(blob.content.slice(0,Math.min(blob.content.byteLength,1024*1024)));
      if(head.includes(EICAR)) return Object.freeze({status:'infected',code:'EICAR_TEST_SIGNATURE',allowAdmission:false});
      if(source.mediaType==='image/svg+xml' && (/<\s*(script|foreignObject|iframe|object|embed)\b/i.test(head)||/\son[a-z]+\s*=/i.test(head))) {
        return Object.freeze({status:'infected',code:'ACTIVE_SVG_CONTENT',allowAdmission:false});
      }
      return Object.freeze({
        status:'clean',
        code:null,
        allowAdmission:true,
        details:Object.freeze({
          assurance:'integrity_only',
          productionMalwareScanner:false,
          warning:'Baseline integrity scanner is suitable for MVP/local controlled inputs; production must replace it with a malware-grade scanner adapter.',
        }),
      });
    },
  });
}
