/** English product copy shared by every studio starter, including additional registered hosts. */
export const studioStarterCopy={
 vibespace:{headline:'A place for focused AI work',description:'Create a Vibe Space, choose a folder, then give a Studio a goal. Work stays isolated. You decide what lands.',openLabel:'Create Vibe Space',footnote:''},
 code:{headline:'Build something great inside Code Studio',description:'Design websites with a live visual canvas and real code. Open an existing file or start a blank page, then shape it your way.',openLabel:'Open file'},
 documents:{headline:'Bring your words to life inside Documents Studio',description:'Write and edit documents on the page. Open a Word document or start fresh, then save a copy without changing your original.',openLabel:'Open DOCX'},
 sheets:{headline:'Make sense of your data inside Sheets Studio',description:'Explore workbooks, edit cells and work with formulas. Open an Excel file or start a blank sheet to organise your next idea.',openLabel:'Open XLSX'},
 slides:{headline:'Tell your story inside Slides Studio',description:'Preview presentations and edit slide text. Open a PowerPoint file or start a blank presentation, then save your work as a new copy.',openLabel:'Open PPTX'},
 sound:{headline:'Shape your sound inside Sound Studio',description:'Trim audio, adjust its sound and preview your changes. Open a recording or start a blank audio project to build something new.',openLabel:'Open audio'},
 video:{headline:'Create amazing edits inside Video Studio',description:'Arrange clips on a timeline, trim your footage and export your edit. Open a video or start a blank project and add media when you are ready.',openLabel:'Open MP4'},
 photos:{headline:'Make every image your own inside Photos Studio',description:'Crop, adjust and refine images with non-destructive edits. Open a photo or start a blank canvas for your next creation.',openLabel:'Open image'},
 vector:{headline:'Draw your next idea inside Vector Studio',description:'Create scalable artwork with shapes, paths and layers. Open an SVG or start a blank canvas and build your design from scratch.',openLabel:'Open SVG'},
 animation:{headline:'Bring your titles to life inside Animation Studio',description:'Build layered compositions with keyframes on a timeline. Restore your last session or start a blank composition and animate it frame by frame.',openLabel:'Restore last session'},
 '3d':{headline:'Create amazing scenes inside 3D Studio',description:'View and inspect 3D models, orbit around them and export a GLB or a PNG still. Open a glTF or GLB model, or start a blank scene.',openLabel:'Open model'},
 design:{headline:'Create beautiful layouts inside Design Studio',description:'Arrange text and shapes on artboards. Start a blank design or open an editable project, then export your layout as SVG.',openLabel:'Open design project'}
} as const;
export type StarterStudioId=keyof typeof studioStarterCopy;
