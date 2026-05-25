/* Offline thesaurus — works without any network. Curated common English
   plus a medical/clinical section so clinical text doesn't come up empty. */
export const MINI_THESAURUS = {
  /* everyday adjectives */
  good:["fine","solid","strong","decent","sound"],
  bad:["poor","weak","subpar","faulty"],
  big:["large","sizeable","major","substantial"],
  small:["minor","slight","modest","limited"],
  large:["big","sizeable","extensive","broad"],
  high:["raised","elevated","steep","increased"],
  low:["reduced","slight","modest","decreased"],
  new:["recent","fresh","modern","novel"],
  old:["former","prior","earlier","aged"],
  important:["key","central","major","critical"],
  difficult:["hard","tough","demanding","tricky"],
  easy:["simple","straightforward","clear"],
  fast:["quick","rapid","swift","speedy"],
  slow:["gradual","unhurried","sluggish"],
  common:["frequent","widespread","usual","typical"],
  rare:["uncommon","scarce","infrequent","unusual"],
  clear:["obvious","evident","plain","apparent"],
  strong:["powerful","robust","intense","marked"],
  weak:["faint","mild","slight","limited"],
  long:["extended","lengthy","prolonged"],
  short:["brief","concise","limited"],
  many:["numerous","several","various","countless"],
  few:["several","limited","sparse"],
  early:["initial","first","preliminary"],
  late:["delayed","subsequent","later"],
  main:["chief","primary","principal","key"],
  whole:["entire","complete","full","total"],
  /* everyday verbs */
  show:["reveal","display","indicate","present"],
  use:["apply","employ","draw on","utilize"],
  help:["aid","support","assist","benefit"],
  make:["build","create","produce","form"],
  get:["obtain","gain","acquire","reach"],
  find:["spot","locate","identify","discover"],
  start:["begin","launch","initiate","open"],
  begin:["start","commence","initiate"],
  end:["finish","close","conclude","stop"],
  change:["alter","shift","adjust","modify"],
  increase:["raise","grow","boost","rise"],
  decrease:["lower","reduce","cut","fall"],
  reduce:["lower","cut","ease","lessen"],
  improve:["boost","enhance","better","lift"],
  cause:["trigger","produce","lead to","induce"],
  affect:["influence","impact","alter"],
  give:["provide","offer","supply","grant"],
  need:["require","call for","demand"],
  keep:["retain","maintain","hold","preserve"],
  allow:["permit","enable","let"],
  prevent:["stop","avert","block","avoid"],
  develop:["build","form","create","grow"],
  remove:["take out","eliminate","clear"],
  include:["contain","cover","comprise"],
  consider:["weigh","think about","review"],
  suggest:["indicate","imply","propose","point to"],
  occur:["happen","take place","arise"],
  appear:["seem","look","emerge"],
  follow:["come after","track","trace"],
  /* everyday nouns */
  way:["method","approach","manner","route"],
  part:["section","portion","piece","segment"],
  area:["region","zone","field","sector"],
  group:["set","cluster","batch","category"],
  problem:["issue","difficulty","trouble","concern"],
  result:["finding","outcome","effect","figure"],
  number:["figure","count","total","amount"],
  amount:["quantity","level","volume"],
  time:["period","span","duration","interval"],
  place:["spot","location","site","setting"],
  point:["detail","aspect","feature","item"],
  level:["degree","extent","amount","rate"],
  rate:["pace","level","frequency","speed"],
  goal:["aim","target","objective","purpose"],
  idea:["concept","notion","thought","point"],
  fact:["detail","point","reality","truth"],
  study:["trial","analysis","research","review"],
  research:["study","investigation","analysis"],
  analysis:["review","assessment","examination"],
  data:["figures","findings","information"],
  evidence:["proof","support","findings"],
  method:["approach","technique","way","process"],
  /* medical / clinical */
  hypertension:["high blood pressure","raised blood pressure"],
  hypotension:["low blood pressure"],
  dyslipidemia:["abnormal blood lipids","lipid disorder","high cholesterol"],
  hyperlipidemia:["high blood lipids","raised cholesterol"],
  cholesterol:["blood lipid","lipid"],
  diabetes:["high blood sugar","diabetes mellitus"],
  hyperglycemia:["high blood sugar","raised glucose"],
  hypoglycemia:["low blood sugar","low glucose"],
  patient:["case","person","individual"],
  disease:["illness","condition","disorder","ailment"],
  illness:["sickness","disease","condition"],
  condition:["disorder","problem","state"],
  disorder:["condition","problem","disease"],
  symptom:["sign","indication","feature"],
  diagnosis:["assessment","identification","finding"],
  treatment:["therapy","care","management","regimen"],
  therapy:["treatment","care","intervention"],
  medication:["drug","medicine","agent"],
  drug:["medication","medicine","agent"],
  dose:["dosage","amount","quantity"],
  dosage:["dose","amount"],
  adverse:["harmful","unwanted","negative"],
  efficacy:["effectiveness","benefit"],
  outcome:["result","finding","endpoint"],
  mortality:["death rate","death"],
  morbidity:["illness","disease burden"],
  prevalence:["frequency","commonness","rate"],
  incidence:["rate","occurrence","frequency"],
  risk:["danger","hazard","chance","likelihood"],
  prognosis:["outlook","forecast","expected course"],
  chronic:["long-term","persistent","ongoing"],
  acute:["sudden","severe","short-term"],
  severe:["serious","marked","intense","extreme"],
  mild:["slight","minor","gentle"],
  moderate:["medium","intermediate","fair"],
  benign:["harmless","non-cancerous","mild"],
  malignant:["cancerous","aggressive"],
  preventable:["avoidable","stoppable"],
  cardiovascular:["heart and vessel","circulatory"],
  renal:["kidney","nephritic"],
  hepatic:["liver"],
  cardiac:["heart"],
  pulmonary:["lung","respiratory"],
  clinical:["medical","bedside"],
  /* transitions / connectors */
  and:["plus","as well as","along with"],
  but:["yet","however","though"],
  so:["therefore","thus","as a result"],
  also:["too","as well","in addition"],
  because:["since","as","given that"],
  although:["though","even though","while"],
  however:["but","yet","though"],
  therefore:["so","thus","hence"],
  thus:["so","therefore","hence"],
  while:["whereas","as","though"],
};

/* Look up a word in the thesaurus, also trying simple inflection forms.
   "risks" -> "risk", "studies" -> "study", "increased" -> "increase". */
export function thesaurusLookup(word) {
  const w = (word || "").toLowerCase().replace(/['’]/g, "");
  if (MINI_THESAURUS[w]) return MINI_THESAURUS[w];
  const tries = [];
  if (/ies$/.test(w)) tries.push(w.replace(/ies$/, "y"));
  if (/ses$/.test(w) || /xes$/.test(w) || /shes$/.test(w) || /ches$/.test(w))
    tries.push(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w)) tries.push(w.slice(0, -1));
  if (/ing$/.test(w)) {
    tries.push(w.slice(0, -3));
    tries.push(w.slice(0, -3) + "e");
  }
  if (/ed$/.test(w) && !/eed$/.test(w)) {
    tries.push(w.slice(0, -2));
    tries.push(w.slice(0, -1));
  }
  if (/ly$/.test(w)) tries.push(w.slice(0, -2));
  for (const t of tries) if (MINI_THESAURUS[t]) return MINI_THESAURUS[t];
  return [];
}
