import { invariant } from '../../core/errors.mjs';

export const TECHNICAL_FLAT_CRITICAL_OBJECTS=Object.freeze(['measurement_anchor','construction_callout']);

export function validateTechnicalFlat({drawing,objects}) {
  invariant(drawing?.id,'TECHNICAL_FLAT_DRAWING_REQUIRED','Technical drawing is required');
  invariant(Array.isArray(objects),'TECHNICAL_FLAT_OBJECTS_REQUIRED','Technical drawing objects are required');
  const issues=[];
  const own=objects.filter(object=>object.drawingId===drawing.id);
  if(own.length!==objects.length) issues.push(issue('blocking','TECHNICAL_FLAT_OBJECT_DRAWING_MISMATCH',{}));
  if(!own.some(object=>object.objectType==='outline')) issues.push(issue('blocking','TECHNICAL_FLAT_OUTLINE_REQUIRED',{viewType:drawing.viewType}));
  for(const object of own){
    if(TECHNICAL_FLAT_CRITICAL_OBJECTS.includes(object.objectType)&&!object.semanticCode&&!object.garmentNodeId){
      issues.push(issue('blocking','TECHNICAL_FLAT_CRITICAL_LINK_REQUIRED',{objectId:object.id,objectType:object.objectType}));
    }
    if(object.objectType==='measurement_anchor'&&!measurementGeometryValid(object.geometry)){
      issues.push(issue('blocking','TECHNICAL_FLAT_MEASUREMENT_GEOMETRY_INVALID',{objectId:object.id}));
    }
    if(object.confidence!==null&&object.confidence<0.5){
      issues.push(issue('warning','TECHNICAL_FLAT_LOW_CONFIDENCE',{objectId:object.id,confidence:object.confidence}));
    }
  }
  return deepFreeze({valid:!issues.some(item=>item.severity==='blocking'),issues});
}

export function assertTechnicalFlatApprovable(value) {
  const result=validateTechnicalFlat(value);
  invariant(result.valid,'TECHNICAL_FLAT_NOT_APPROVABLE','Technical flat has blocking validation issues',{issues:result.issues});
  return result;
}

function measurementGeometryValid(geometry){
  if(!geometry||typeof geometry!=='object')return false;
  if(Array.isArray(geometry.points))return geometry.points.length>=2;
  return ['x1','y1','x2','y2'].every(key=>typeof geometry[key]==='number'&&Number.isFinite(geometry[key]));
}
function issue(severity,code,details){return Object.freeze({severity,code,details:Object.freeze({...details})});}
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
