// Convert an inline SVG element to a PNG data URL, preserving aspect ratio
export async function svgElementToPngDataUrl(svgEl: SVGSVGElement, scale = 2): Promise<string> {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);

  // Determine intrinsic dimensions
  const bbox = svgEl.getBoundingClientRect();
  const width = (svgEl.width && typeof svgEl.width.baseVal?.value === 'number' && svgEl.width.baseVal.value) || bbox.width || 800;
  const height = (svgEl.height && typeof svgEl.height.baseVal?.value === 'number' && svgEl.height.baseVal.value) || bbox.height || 400;

  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    // Important for inline resources
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
