import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidPhotoError, renderGuestPhoto } from "@/services/media/image-processing/server";

async function sampleImage() {
  return sharp({
    create: { width: 80, height: 40, channels: 3, background: "#ad5938" },
  }).png().toBuffer();
}

describe("server photo experience processing", () => {
  it("renders a filter and event frame into a real JPEG with the event title and date", async () => {
    const bytes = await sampleImage();
    const result = await renderGuestPhoto({
      bytes,
      filter: "DISPOSABLE_CAM",
      frame: "POLAROID_WHITE",
      eventName: "Audrey's Party",
      eventDate: new Date("2026-11-06T12:00:00.000Z"),
    });
    const metadata = await sharp(result).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBeGreaterThan(80);
    expect(metadata.height).toBeGreaterThan(40);
    expect(result).not.toEqual(bytes);
  }, 10_000);

  it("places the event name and date in the Polaroid footer, below the photo", async () => {
    const bytes = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#ad5938" },
    }).png().toBuffer();
    const output = await renderGuestPhoto({
      bytes,
      filter: "ORIGINAL",
      frame: "POLAROID_WHITE",
      eventName: "Party 2026",
      eventDate: new Date("2026-11-06T12:00:00.000Z"),
    });
    const metadata = await sharp(output).metadata();
    const frameSide = Math.round(300 * 0.055);
    const photoBottom = frameSide + 300;
    const { data: photoPixels } = await sharp(output)
      .extract({ left: frameSide, top: frameSide, width: 400, height: 300 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data: footerPixels } = await sharp(output)
      .extract({ left: 0, top: photoBottom, width: metadata.width!, height: metadata.height! - photoBottom })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const darkPhotoPixels = Array.from({ length: photoPixels.length / 3 }, (_, index) => {
      const offset = index * 3;
      return photoPixels[offset] * 0.299 + photoPixels[offset + 1] * 0.587 + photoPixels[offset + 2] * 0.114;
    }).filter((brightness) => brightness < 85);
    const darkFooterPixels = Array.from({ length: footerPixels.length / 3 }, (_, index) => {
      const offset = index * 3;
      return footerPixels[offset] * 0.299 + footerPixels[offset + 1] * 0.587 + footerPixels[offset + 2] * 0.114;
    }).filter((brightness) => brightness < 85);

    expect(darkPhotoPixels).toHaveLength(0);
    expect(darkFooterPixels.length).toBeGreaterThan(0);
  });

  it("applies every supported filter and frame combination", async () => {
    const bytes = await sampleImage();
    const filters = ["ORIGINAL", "DISPOSABLE_CAM", "VINTAGE_FILM", "RETRO", "CLASSIC"] as const;
    const frames = ["NO_FRAME", "POLAROID_WHITE", "POLAROID_VINTAGE", "FILM_FRAME", "MINIMAL_FRAME"] as const;

    for (const filter of filters) {
      for (const frame of frames) {
        const output = await renderGuestPhoto({
          bytes,
          filter,
          frame,
          eventName: "Event",
          eventDate: new Date("2026-11-06T12:00:00.000Z"),
        });
        expect((await sharp(output).metadata()).format, `${filter}/${frame}`).toBe("jpeg");
      }
    }
  });

  it("rejects image payloads that have valid-looking MIME but cannot be decoded", async () => {
    await expect(renderGuestPhoto({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      filter: "ORIGINAL",
      frame: "NO_FRAME",
      eventName: "Event",
      eventDate: null,
    })).rejects.toBeInstanceOf(InvalidPhotoError);
  });
});
