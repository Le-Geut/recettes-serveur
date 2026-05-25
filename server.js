if (process.env.NODE_ENV !== 'production') { require('dotenv').config(); }
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());
console.log('CLE API:', process.env.ANTHROPIC_API_KEY ? 'PRESENTE' : 'ABSENTE'); console.log('TEST:', process.env.TEST);

const apiKey = process.env.ANTHROPIC_API_KEY; console.log('KEY DEBUG:', apiKey ? apiKey.substring(0,10) : 'VIDE'); const anthropic = new Anthropic({ apiKey: apiKey });

const legumesParMois = {
  janvier: 'poireau, endive, chou, panais, celeri',
  fevrier: 'poireau, endive, chou, mache, topinambour',
  mars: 'poireau, epinard, radis, asperge',
  avril: 'asperge, epinard, petits pois, radis',
  mai: 'asperge, petits pois, feve, fraise',
  juin: 'courgette, tomate, haricot vert, fraise',
  juillet: 'tomate, courgette, aubergine, poivron, melon',
  aout: 'tomate, poivron, aubergine, mais, peche',
  septembre: 'potiron, champignon, raisin, pomme',
  octobre: 'potiron, champignon, betterave, pomme',
  novembre: 'poireau, chou, panais, pomme de terre',
  decembre: 'poireau, endive, chou, celeri, clementine',
};

function getContexte(equipements, preferences) {
  const mois = new Date().toLocaleString('fr-FR', { month: 'long' });
  const legumes = legumesParMois[mois] || 'legumes de saison';
  const equip = Object.entries(equipements).filter(([_,v])=>v).map(([k])=>k).join(', ');
  const restrict = Object.entries(preferences).filter(([_,v])=>v).map(([k])=>k).join(', ') || 'aucune';
  return { mois, legumes, equip, restrict };
}

function parseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch(e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch(e2) {}
    }
    throw new Error('JSON invalide');
  }
}

app.post('/recette', async (req, res) => {
  const { filtre, equipements, preferences, tempsCuisine } = req.body;
  const { mois, legumes, equip, restrict } = getContexte(equipements, preferences);
  const styleMap = {
    Leger: 'legere et peu calorique',
    Consistant: 'consistante et nourrissante',
    Rapide: 'rapide en moins de 20 minutes',
    'Petit-dej': 'de petit-dejeuner',
    Etudiant: 'simple economique style etudiant: pates carbonara, pizza, cordon bleu, steak frites',
  };
  const style = styleMap[filtre] || 'equilibree';
  const prompt = `Chef cuisinier francais. Gene UNE recette ${style} pour 2 personnes. Equipements: ${equip}. Restrictions: ${restrict}. Temps max: ${tempsCuisine} min. Saison (${mois}): ${legumes}. Ingredients classiques et varies. Indiquer saison:true si produit de saison. JSON uniquement: {"nom":"...","emoji":"...","temps":"...","difficulte":"...","ingredients":[{"nom":"...","quantite":"...","saison":false}],"etapes":["..."],"conseil":"..."}`;
  try {
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] });
    res.json(parseJSON(msg.content[0].text));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur recette' }); }
});

app.post('/chat', async (req, res) => {
  const { message, historique, equipements, preferences } = req.body;
  const { mois, legumes, equip, restrict } = getContexte(equipements, preferences);
  const systeme = `Tu es un chef cuisinier francais sympa. Reponds TOUJOURS avec UNE SEULE recette a la fois en JSON valide uniquement, sans texte avant ou apres. Si on te demande plusieurs recettes, propose en une seule et dis dans le champ reponse que tu peux en proposer d autres ensuite: {"reponse":"message en francais","recette":{"nom":"...","emoji":"...","temps":"...","difficulte":"...","ingredients":[{"nom":"...","quantite":"...","saison":false}],"etapes":["..."],"conseil":"..."}}. Saison (${mois}): ${legumes}. Equipements: ${equip}. Restrictions: ${restrict}.`;
  const messagesHist = [];
  if (historique && historique.length > 0) {
    for (const m of historique) {
      if (m.role === 'user' && m.text) {
        messagesHist.push({ role: 'user', content: String(m.text).substring(0, 500) });
      } else if (m.role === 'assistant' && m.text) {
        messagesHist.push({ role: 'assistant', content: String(m.text).substring(0, 500) });
      }
    }
  }
  messagesHist.push({ role: 'user', content: String(message).substring(0, 500) });
  try {
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: systeme, messages: messagesHist });
    res.json(parseJSON(msg.content[0].text));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur chat' }); }
});

app.post('/planning-libre', async (req, res) => {
  const { quantites, equipements, preferences } = req.body;
  const { mois, legumes, equip, restrict } = getContexte(equipements, preferences);
  const prompt = `Chef cuisinier francais. Gene des recettes variees pour 2 personnes. Equipements: ${equip}. Restrictions: ${restrict}. Saison (${mois}): ${legumes}. Gene exactement: ${quantites.dejeuners} dejeuners, ${quantites.diners} diners, ${quantites.petitsDejeuners} petits-dejeuners, ${quantites.desserts} desserts. Pas de repetition. JSON uniquement: {"dejeuners":[{"nom":"...","emoji":"...","temps":"...","difficulte":"..."}],"diners":[...],"petitsDejeuners":[...],"desserts":[...]}`;
  try {
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] });
    res.json(parseJSON(msg.content[0].text));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur planning' }); }
});

app.post('/alternatives', async (req, res) => {
  const { categorie, nomActuel, equipements, preferences } = req.body;
  const { mois, legumes, equip, restrict } = getContexte(equipements, preferences);
  const catMap = { dejeuners: 'dejeuner', diners: 'diner', petitsDejeuners: 'petit-dejeuner', desserts: 'dessert' };
  const prompt = `Chef cuisinier francais. Propose 3 alternatives de ${catMap[categorie] || categorie} pour 2 personnes. Pas de repetition avec: ${nomActuel}. Equipements: ${equip}. Restrictions: ${restrict}. Saison (${mois}): ${legumes}. JSON uniquement: {"alternatives":[{"nom":"...","emoji":"...","temps":"...","difficulte":"..."},{"nom":"...","emoji":"...","temps":"...","difficulte":"..."},{"nom":"...","emoji":"...","temps":"...","difficulte":"..."}]}`;
  try {
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] });
    res.json(parseJSON(msg.content[0].text));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur alternatives' }); }
});

app.post('/recette-detail', async (req, res) => {
  const { nom, equipements, preferences } = req.body;
  const { mois, legumes, equip, restrict } = getContexte(equipements, preferences);
  const prompt = `Chef cuisinier francais. Donne la recette complete de "${nom}" pour 2 personnes. Equipements: ${equip}. Restrictions: ${restrict}. Saison (${mois}): ${legumes}. Indiquer saison:true si produit de saison. JSON uniquement: {"ingredients":[{"nom":"...","quantite":"...","saison":false}],"etapes":["..."],"conseil":"..."}`;
  try {
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] });
    res.json(parseJSON(msg.content[0].text));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur detail' }); }
});

app.post('/courses-libre', async (req, res) => {
  const { repas } = req.body;
  const prompt = `Chef cuisinier francais. Liste de courses complete pour 2 personnes pour: ${repas}. Regroupe par rayon. Quantites precises. JSON uniquement: {"rayons":[{"nom":"Fruits et legumes","articles":[{"nom":"Tomates","quantite":"500g"}]}]}`;
  try {
    const msg = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] });
    res.json(parseJSON(msg.content[0].text));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur courses' }); }
});

app.listen(process.env.PORT, () => {
  console.log(`Serveur lance sur le port ${process.env.PORT}`);
});







