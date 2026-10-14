import {INTERFACE_PROTOTYPE_CATALOGUES} from './prototypeI18n';
import {INTERFACE_EXPORT_CATALOGUES} from './exportI18n';
import {INTERFACE_SELECTION_CATALOGUES} from './selectionI18n';
import {INTERFACE_MEDIA_CATALOGUES} from './mediaI18n';
import {INTERFACE_OUTPUT_CATALOGUES} from './outputI18n';
import {INTERFACE_LAYOUT_CATALOGUES} from './layoutI18n';
const en={
 'cmd.studio.interface':'Switch to Interface Studio','studio.interface':'Interface','interface.layers':'Pages and layers','interface.properties':'Properties',
 'interface.title':'Design interfaces inside Interface Studio','interface.description':'Build screens from frames, text and shapes. Your work stays local, with undo and session recovery.',
 'interface.new':'Create blank document','interface.open':'Open snapshot','interface.save':'Save snapshot','interface.empty':'Create or open a document to begin.',
 'interface.noSelection':'Select a layer to edit its properties.','interface.name':'Name','interface.page':'Page','interface.addPage':'Add page',
 'interface.frame':'Frame','interface.rectangle':'Rectangle','interface.text':'Text','interface.group':'Group','interface.parent':'Parent','interface.root':'Page root',
 'interface.x':'X','interface.y':'Y','interface.width':'Width','interface.height':'Height','interface.fill':'Fill','interface.hidden':'Hidden','interface.locked':'Locked',
 'interface.zoom':'Zoom','interface.unsaved':'Unsaved changes','interface.saved':'Saved snapshot','interface.copy':'A snapshot copy was downloaded. The document stays unsaved until a file write is confirmed.',
 'interface.replace':'Replace this Interface document? Save a snapshot first to keep your changes.',
 'interface.up':'Move up','interface.down':'Move down','interface.delete':'Delete layer','interface.resize':'Resize {name}',
 'cmd.interface.new':'Interface: New document','cmd.interface.save':'Interface: Save snapshot','cmd.interface.undo':'Interface: Undo','cmd.interface.redo':'Interface: Redo',
 'cmd.interface.addFrame':'Interface: Add frame','cmd.interface.addRectangle':'Interface: Add rectangle','cmd.interface.addText':'Interface: Add text','cmd.interface.delete':'Interface: Delete layer',
};
type Keys=keyof typeof en;
const de:Record<Keys,string>={
 'cmd.studio.interface':'Zum Interface Studio wechseln',
 'studio.interface':'Interface','interface.layers':'Seiten und Ebenen','interface.properties':'Eigenschaften','interface.title':'Oberflächen im Interface Studio gestalten','interface.description':'Bildschirme aus Rahmen, Text und Formen erstellen. Deine Arbeit bleibt lokal, mit Rückgängig und Sitzungswiederherstellung.',
 'interface.new':'Leeres Dokument erstellen','interface.open':'Snapshot öffnen','interface.save':'Snapshot speichern','interface.empty':'Erstelle oder öffne ein Dokument.',
 'interface.noSelection':'Wähle eine Ebene, um ihre Eigenschaften zu bearbeiten.','interface.name':'Name','interface.page':'Seite','interface.addPage':'Seite hinzufügen','interface.frame':'Rahmen','interface.rectangle':'Rechteck','interface.text':'Text','interface.group':'Gruppe','interface.parent':'Übergeordnet','interface.root':'Seitenwurzel',
 'interface.x':'X','interface.y':'Y','interface.width':'Breite','interface.height':'Höhe','interface.fill':'Füllung','interface.hidden':'Ausgeblendet','interface.locked':'Gesperrt','interface.zoom':'Zoom','interface.unsaved':'Ungespeicherte Änderungen','interface.saved':'Gespeicherter Snapshot','interface.copy':'Eine Snapshot-Kopie wurde heruntergeladen. Das Dokument bleibt ungespeichert, bis ein Schreibvorgang bestätigt ist.',
 'interface.replace':'Dieses Interface-Dokument ersetzen? Speichere zuerst einen Snapshot, um deine Änderungen zu behalten.','interface.up':'Nach oben','interface.down':'Nach unten','interface.delete':'Ebene löschen','interface.resize':'{name} skalieren',
 'cmd.interface.new':'Interface: Neues Dokument','cmd.interface.save':'Interface: Snapshot speichern','cmd.interface.undo':'Interface: Rückgängig','cmd.interface.redo':'Interface: Wiederholen','cmd.interface.addFrame':'Interface: Rahmen hinzufügen','cmd.interface.addRectangle':'Interface: Rechteck hinzufügen','cmd.interface.addText':'Interface: Text hinzufügen','cmd.interface.delete':'Interface: Ebene löschen',
};
const es:Record<Keys,string>={
 'cmd.studio.interface':'Cambiar a Interface Studio',
 'studio.interface':'Interface','interface.layers':'Páginas y capas','interface.properties':'Propiedades','interface.title':'Diseña interfaces en Interface Studio','interface.description':'Crea pantallas con marcos, texto y formas. Tu trabajo permanece local, con deshacer y recuperación de sesión.',
 'interface.new':'Crear documento vacío','interface.open':'Abrir instantánea','interface.save':'Guardar instantánea','interface.empty':'Crea o abre un documento.','interface.noSelection':'Selecciona una capa para editar sus propiedades.','interface.name':'Nombre','interface.page':'Página','interface.addPage':'Añadir página','interface.frame':'Marco','interface.rectangle':'Rectángulo','interface.text':'Texto','interface.group':'Grupo','interface.parent':'Contenedor','interface.root':'Raíz de página',
 'interface.x':'X','interface.y':'Y','interface.width':'Ancho','interface.height':'Alto','interface.fill':'Relleno','interface.hidden':'Oculto','interface.locked':'Bloqueado','interface.zoom':'Zoom','interface.unsaved':'Cambios sin guardar','interface.saved':'Instantánea guardada','interface.copy':'Se descargó una copia. El documento sigue sin guardar hasta confirmar la escritura.','interface.replace':'¿Reemplazar este documento? Guarda una instantánea para conservar los cambios.','interface.up':'Subir','interface.down':'Bajar','interface.delete':'Eliminar capa','interface.resize':'Redimensionar {name}',
 'cmd.interface.new':'Interface: Nuevo documento','cmd.interface.save':'Interface: Guardar instantánea','cmd.interface.undo':'Interface: Deshacer','cmd.interface.redo':'Interface: Rehacer','cmd.interface.addFrame':'Interface: Añadir marco','cmd.interface.addRectangle':'Interface: Añadir rectángulo','cmd.interface.addText':'Interface: Añadir texto','cmd.interface.delete':'Interface: Eliminar capa',
};
const fr:Record<Keys,string>={
 'cmd.studio.interface':'Passer à Interface Studio',
 'studio.interface':'Interface','interface.layers':'Pages et calques','interface.properties':'Propriétés','interface.title':'Créez des interfaces dans Interface Studio','interface.description':'Créez des écrans avec des cadres, du texte et des formes. Votre travail reste local, avec annulation et récupération de session.',
 'interface.new':'Créer un document vierge','interface.open':'Ouvrir un instantané','interface.save':'Enregistrer un instantané','interface.empty':'Créez ou ouvrez un document.','interface.noSelection':'Sélectionnez un calque pour modifier ses propriétés.','interface.name':'Nom','interface.page':'Page','interface.addPage':'Ajouter une page','interface.frame':'Cadre','interface.rectangle':'Rectangle','interface.text':'Texte','interface.group':'Groupe','interface.parent':'Parent','interface.root':'Racine de page',
 'interface.x':'X','interface.y':'Y','interface.width':'Largeur','interface.height':'Hauteur','interface.fill':'Remplissage','interface.hidden':'Masqué','interface.locked':'Verrouillé','interface.zoom':'Zoom','interface.unsaved':'Modifications non enregistrées','interface.saved':'Instantané enregistré','interface.copy':"Une copie a été téléchargée. Le document reste non enregistré jusqu'à confirmation de l'écriture.",'interface.replace':"Remplacer ce document ? Enregistrez d'abord un instantané pour conserver vos modifications.",'interface.up':'Monter','interface.down':'Descendre','interface.delete':'Supprimer le calque','interface.resize':'Redimensionner {name}',
 'cmd.interface.new':'Interface: Nouveau document','cmd.interface.save':'Interface: Enregistrer un instantané','cmd.interface.undo':'Interface: Annuler','cmd.interface.redo':'Interface: Rétablir','cmd.interface.addFrame':'Interface: Ajouter un cadre','cmd.interface.addRectangle':'Interface: Ajouter un rectangle','cmd.interface.addText':'Interface: Ajouter du texte','cmd.interface.delete':'Interface: Supprimer le calque',
};
const pt:Record<Keys,string>={
 'cmd.studio.interface':'Mudar para Interface Studio',
 'studio.interface':'Interface','interface.layers':'Páginas e camadas','interface.properties':'Propriedades','interface.title':'Crie interfaces no Interface Studio','interface.description':'Crie telas com quadros, texto e formas. Seu trabalho fica local, com desfazer e recuperação de sessão.',
 'interface.new':'Criar documento vazio','interface.open':'Abrir snapshot','interface.save':'Salvar snapshot','interface.empty':'Crie ou abra um documento.','interface.noSelection':'Selecione uma camada para editar suas propriedades.','interface.name':'Nome','interface.page':'Página','interface.addPage':'Adicionar página','interface.frame':'Quadro','interface.rectangle':'Retângulo','interface.text':'Texto','interface.group':'Grupo','interface.parent':'Pai','interface.root':'Raiz da página',
 'interface.x':'X','interface.y':'Y','interface.width':'Largura','interface.height':'Altura','interface.fill':'Preenchimento','interface.hidden':'Oculto','interface.locked':'Bloqueado','interface.zoom':'Zoom','interface.unsaved':'Alterações não salvas','interface.saved':'Snapshot salvo','interface.copy':'Uma cópia foi baixada. O documento continua não salvo até a confirmação da gravação.','interface.replace':'Substituir este documento? Salve um snapshot primeiro para manter suas alterações.','interface.up':'Mover acima','interface.down':'Mover abaixo','interface.delete':'Excluir camada','interface.resize':'Redimensionar {name}',
 'cmd.interface.new':'Interface: Novo documento','cmd.interface.save':'Interface: Salvar snapshot','cmd.interface.undo':'Interface: Desfazer','cmd.interface.redo':'Interface: Refazer','cmd.interface.addFrame':'Interface: Adicionar quadro','cmd.interface.addRectangle':'Interface: Adicionar retângulo','cmd.interface.addText':'Interface: Adicionar texto','cmd.interface.delete':'Interface: Excluir camada',
};
export const INTERFACE_CATALOGUES={en,de,es,fr,'pt-BR':pt};

for(const [locale,extra] of Object.entries(INTERFACE_LAYOUT_CATALOGUES))Object.assign(INTERFACE_CATALOGUES[locale as keyof typeof INTERFACE_CATALOGUES],extra);

for(const [locale,extra] of Object.entries(INTERFACE_OUTPUT_CATALOGUES))Object.assign(INTERFACE_CATALOGUES[locale as keyof typeof INTERFACE_CATALOGUES],extra);

for(const [locale,extra] of Object.entries(INTERFACE_MEDIA_CATALOGUES))Object.assign(INTERFACE_CATALOGUES[locale as keyof typeof INTERFACE_CATALOGUES],extra);

for(const [locale,extra] of Object.entries(INTERFACE_SELECTION_CATALOGUES))Object.assign(INTERFACE_CATALOGUES[locale as keyof typeof INTERFACE_CATALOGUES],extra);

for(const [locale,extra] of Object.entries(INTERFACE_EXPORT_CATALOGUES))Object.assign(INTERFACE_CATALOGUES[locale as keyof typeof INTERFACE_CATALOGUES],extra);

for(const [locale,extra] of Object.entries(INTERFACE_PROTOTYPE_CATALOGUES))Object.assign(INTERFACE_CATALOGUES[locale as keyof typeof INTERFACE_CATALOGUES],extra);
