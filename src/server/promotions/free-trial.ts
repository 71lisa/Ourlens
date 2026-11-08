export function isPhotoLimitReached(photoCount: number, photoLimit: number | null): boolean {
  return photoLimit !== null && photoCount >= photoLimit;
}
