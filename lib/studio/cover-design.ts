export const coverPromptMaxLength = 2400;

export function coverImageFrame(width: number, height: number) {
  const imageWidth = width > height ? 1536 : 1024;
  const imageHeight = height > width ? 1536 : 1024;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const safeWidth = Math.floor(100 * width / (imageWidth * scale));
  const safeHeight = Math.floor(100 * height / (imageHeight * scale));
  return {
    size: `${imageWidth}x${imageHeight}`,
    safeArea: `the central ${safeWidth}% of the image width and ${safeHeight}% of its height, with extra padding around the lettering`,
  };
}
