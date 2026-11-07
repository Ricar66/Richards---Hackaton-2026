import { NextResponse } from "next/server";
function retired(){return NextResponse.json({error:"Funcionalidade descontinuada. O escopo atual é monitoramento hidráulico.",code:"RETIRED_FEATURE"},{status:410,headers:{"Cache-Control":"no-store"}});}
export const GET=retired;export const POST=retired;export const PATCH=retired;
