/**
 * Corrige les dégâts d'un script de renommage antérieur qui a remplacé
 * CHAQUE mention textuelle de "MobilePay" par la balise <img> complète du
 * logo — y compris à l'intérieur de chaînes JS et d'un attribut mailto:,
 * ce qui casse le parseur JSX, et de façon générale une mauvaise pratique
 * (le logo doit rester réservé à l'en-tête/pied de page, pas remplacer
 * chaque occurrence du mot dans le texte courant).
 *
 * Usage : node fix-brand-mentions.mjs   (depuis client/)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = join(process.cwd(), 'src');

// Motif exact laissé par le script fautif : le logo inline, avec ses
// variantes de hauteur (h-5 à h-8) et de marge (mr-1 / ml-1 / aucune).
const IMG_TAG = /<img src="\/brand\/orzayah-logo\.png" alt="ORZAYAH" className="inline-block h-\d+ w-auto align-middle(?: m[lr]-1)?" \/>/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, files);
    } else if (['.tsx', '.ts'].includes(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

let totalFiles = 0;
let totalReplacements = 0;

for (const file of walk(ROOT)) {
  let content = readFileSync(file, 'utf8');
  const before = content;

  // 1. Cas spécifique : l'adresse email cassée devient l'adresse réelle
  //    sur le nouveau domaine — un remplacement générique produirait
  //    "info@ORZAYAH-ci.com", incohérent (nom de marque + ancien domaine).
  content = content.replace(
    new RegExp(`mailto:info@${IMG_TAG.source}-ci\\.com`),
    'mailto:info@orzayah.com',
  );

  // 2. Partout ailleurs : retour au texte simple "ORZAYAH" — le logo ne
  //    doit pas remplacer chaque mention du mot dans une phrase.
  const matches = content.match(IMG_TAG);
  if (matches) totalReplacements += matches.length;
  content = content.replace(IMG_TAG, 'ORZAYAH');

  if (content !== before) {
    writeFileSync(file, content, 'utf8');
    totalFiles++;
    console.log(`corrigé : ${file.replace(process.cwd(), '.')}`);
  }
}

console.log(`\n${totalReplacements} mentions corrigées dans ${totalFiles} fichiers.`);
