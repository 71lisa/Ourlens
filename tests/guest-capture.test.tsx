// @vitest-environment jsdom

import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestCapture } from "@/features/memories/guest-capture";
import { GuestGallery } from "@/features/memories/guest-gallery";
import GuestEventPage from "@/app/e/[slug]/page";
import GuestGalleryPage from "@/app/e/[slug]/gallery/page";

const { renderPhoto, findUnique, countMedia, refreshRouter } = vi.hoisted(() => ({
  renderPhoto: vi.fn(),
  findUnique: vi.fn(),
  countMedia: vi.fn(),
  refreshRouter: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; fill?: boolean }) => {
    const imageProps = { ...props };
    delete imageProps.unoptimized;
    delete imageProps.fill;
    return createElement("img", imageProps);
  },
}));

vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    createElement("a", props, props.children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshRouter }),
}));

vi.mock("@/services/media/image-processing/local-canvas", () => ({
  getLocalImageProcessingService: () => ({ renderPhoto }),
}));

vi.mock("@/features/memories/normalize-guest-photo", () => ({
  MAX_SOURCE_PHOTO_BYTES: 32 * 1024 * 1024,
  normalizeGuestPhoto: vi.fn(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Berkas ini bukan foto yang didukung. Pilih gambar JPG, PNG, atau WebP.");
    }
    if (file.type === "image/heic" || file.type === "image/heif") {
      return new File(["normalized"], `${file.name.replace(/\.[^.]*$/, "")}.jpg`, {
        type: "image/jpeg",
      });
    }
    return file;
  }),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { event: { findUnique }, mediaAsset: { count: countMedia } },
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

vi.mock("@/server/authorization/policies", () => ({
  canAcceptGuestContributions: () => true,
  canAccessGuestEventPage: () => true,
  canViewEventGallery: () => true,
  getEffectiveGuestEventStatus: () => "LIVE",
  PUBLIC_GALLERY_MODERATION_STATUSES: ["APPROVED"],
}));

type MockPhotoQuota = {
  scope: "guest" | "event";
  uploaded: number;
  limit: number;
  remaining: number;
  participantCount: number | null;
  participantLimit: number | null;
  canUpload: boolean;
};

type MockResponse = {
  ok: boolean;
  json: () => Promise<{
    error?: string;
    nameRequired?: boolean;
    photoQuota?: MockPhotoQuota;
  }>;
};

type FetchCall = { url: string; init?: RequestInit };

function mockGuestApi(uploadResponse?: Promise<MockResponse>) {
  const calls: FetchCall[] = [];
  let resolveSession!: (response: MockResponse) => void;
  let sessionRequestCount = 0;
  const sessionResponse = new Promise<MockResponse>((resolve) => {
    resolveSession = resolve;
  });
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/guest-session")) {
      sessionRequestCount += 1;
      return sessionRequestCount === 1
        ? sessionResponse
        : Promise.resolve(successfulResponse());
    }
    return uploadResponse ?? Promise.resolve({
      ok: true,
      json: async () => ({
        photoQuota: {
          scope: "guest" as const,
          uploaded: 1,
          limit: 20,
          remaining: 19,
          participantCount: 1,
          participantLimit: 5,
          canUpload: true,
        },
      }),
    });
  }));
  return { calls, resolveSession };
}

function fileInput(label: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`Missing file input: ${label}`);
  return input;
}

function photoFile(name = "memory.jpg", type = "image/jpeg") {
  const signature = type === "image/png"
    ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    : type === "image/webp"
      ? [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
      : [0xff, 0xd8, 0xff, 0x01];
  return new File([new Uint8Array(signature)], name, { type });
}

const guestProps = {
  slug: "sample-event",
  eventName: "Audrey's Party",
  eventDateLabel: "06 November 2026",
  filter: "DISPOSABLE_CAM" as const,
  frame: "POLAROID_WHITE" as const,
  galleryAvailable: true,
};

const successfulResponse = (photoQuota: MockPhotoQuota = {
  scope: "guest" as const,
  uploaded: 0,
  limit: 20,
  remaining: 20,
  participantCount: 0,
  participantLimit: 5,
  canUpload: true,
}): MockResponse => ({ ok: true, json: async () => ({ ready: true, photoQuota }) });

async function waitForSessionReady() {
  await waitFor(() => expect(screen.queryByText("Menyiapkan ruang tamu…")).toBeNull());
}

async function choosePhoto(file: File) {
  fireEvent.change(fileInput("Pilih foto dari galeri"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText(/Pratinjau foto dengan filter .* dan bingkai/)).toBeTruthy());
}

let originalCreateObjectURL: PropertyDescriptor | undefined;
let originalRevokeObjectURL: PropertyDescriptor | undefined;

beforeEach(() => {
  renderPhoto.mockReset();
  findUnique.mockReset();
  countMedia.mockReset();
  countMedia.mockResolvedValue(0);
  renderPhoto.mockResolvedValue(new Blob(["processed"], { type: "image/jpeg" }));
  originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:ourlens-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("guest photo upload", () => {
  it("asks first-time guests for their name before enabling photo upload", async () => {
    const { calls, resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);

    resolveSession({
      ok: true,
      json: async () => ({ ready: false, nameRequired: true }),
    });
    expect(await screen.findByLabelText("Masukkan nama sebelum berbagi foto")).toBeTruthy();
    expect(screen.queryByLabelText("Pilih foto dari galeri")).toBeNull();

    fireEvent.change(screen.getByLabelText("Masukkan nama sebelum berbagi foto"), {
      target: { value: "Alya" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));

    await waitFor(() => expect(
      (screen.getByLabelText("Pilih foto dari galeri") as HTMLInputElement).disabled,
    ).toBe(false));
    expect(calls.filter((call) => call.url.endsWith("/guest-session"))).toHaveLength(2);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ displayName: "Alya" });
  });

  it("uses a public guest session without presenting sign-in or style controls", async () => {
    const { calls, resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);

    expect(screen.getByText("Tidak perlu membuat akun. Gaya foto acara akan diterapkan otomatis.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /login|sign in/i })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(fileInput("Pilih foto dari kamera").closest("label")?.className).toContain("bg-burgundy");
    expect(fileInput("Pilih foto dari galeri").closest("label")?.className).toContain("border-burgundy");
    expect(screen.getByLabelText("Pilih foto dari kamera")).toBeTruthy();
    expect(screen.getByLabelText("Pilih foto dari galeri")).toBeTruthy();
    expect((screen.getByLabelText("Pilih foto dari galeri") as HTMLInputElement).disabled).toBe(true);
    expect(calls[0].url).toContain("/guest-session");
    expect(calls[0].init).toMatchObject({ method: "POST", credentials: "same-origin" });

    resolveSession(successfulResponse());
    await waitForSessionReady();
    expect((screen.getByLabelText("Pilih foto dari galeri") as HTMLInputElement).disabled).toBe(false);
  });

  it("previews the event's fixed filter and frame and submits the original photo only", async () => {
    const { calls, resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);
    resolveSession(successfulResponse());
    await waitForSessionReady();

    const photo = photoFile();
    await choosePhoto(photo);
    expect(renderPhoto).toHaveBeenCalledWith(photo, {
      filter: "DISPOSABLE_CAM",
      frame: "POLAROID_WHITE",
      eventName: "Audrey's Party",
      eventDate: "06 November 2026",
      enhanced: false,
    });

    fireEvent.change(screen.getByLabelText(/Keterangan/), { target: { value: "Our day" } });
    fireEvent.click(screen.getByRole("button", { name: "Unggah Foto" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/memories"))).toBe(true));

    const uploadCall = calls.find((call) => call.url.endsWith("/memories"));
    const body = uploadCall?.init?.body as FormData;
    expect(body.get("kind")).toBe("photo");
    expect(body.get("photo")).toBe(photo);
    expect(body.get("original")).toBeNull();
    expect(body.get("caption")).toBe("Our day");
    expect(uploadCall?.init?.credentials).toBe("same-origin");
    expect(screen.getByRole("heading", { name: "Foto kamu sudah masuk ke galeri." })).toBeTruthy();
    expect(screen.getByText("Foto yang sudah diunggah: 1/20")).toBeTruthy();
    expect(screen.getByText("Kamu masih bisa mengunggah 19 foto lagi.")).toBeTruthy();
  });

  it("shows a clear exhausted quota and prevents another upload", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);
    resolveSession(successfulResponse({
      scope: "guest",
      uploaded: 20,
      limit: 20,
      remaining: 0,
      participantCount: 1,
      participantLimit: 5,
      canUpload: false,
    }));
    await waitForSessionReady();

    expect(screen.getByText("Foto yang sudah diunggah: 20/20")).toBeTruthy();
    expect(screen.getByText("Batas unggah 20 foto telah tercapai.")).toBeTruthy();
    expect((screen.getByLabelText("Pilih foto dari galeri") as HTMLInputElement).disabled).toBe(true);
  });

  it("explains when guest capacity is full", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);
    resolveSession(successfulResponse({
      scope: "guest",
      uploaded: 0,
      limit: 20,
      remaining: 20,
      participantCount: 5,
      participantLimit: 5,
      canUpload: false,
    }));
    await waitForSessionReady();

    expect(screen.getByText("Kapasitas tamu acara sudah penuh. Tamu baru tidak dapat mengunggah foto.")).toBeTruthy();
    expect((screen.getByLabelText("Pilih foto dari galeri") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows free trial usage against the event-wide limit", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);
    resolveSession(successfulResponse({
      scope: "event",
      uploaded: 8,
      limit: 10,
      remaining: 2,
      participantCount: null,
      participantLimit: null,
      canUpload: true,
    }));
    await waitForSessionReady();

    expect(screen.getByText("Foto yang sudah diunggah: 8/10 · batas total uji coba gratis")).toBeTruthy();
    expect(screen.getByText("Kamu masih bisa mengunggah 2 foto lagi.")).toBeTruthy();
  });

  it("does not allow video or invalid image formats through the guest picker", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture {...guestProps} />);
    expect(document.querySelector('input[type="file"]')?.getAttribute("accept")).toBe("image/*");
    expect(document.querySelector('input[accept*="video"]')).toBeNull();

    resolveSession(successfulResponse());
    await waitForSessionReady();
    fireEvent.change(fileInput("Pilih foto dari galeri"), {
      target: { files: [new File(["not an image"], "notes.txt", { type: "text/plain" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Berkas ini bukan foto yang didukung"));
  });

  it("shows and uploads a selected photo when randomUUID is unavailable on an HTTP LAN origin", async () => {
    const { calls, resolveSession } = mockGuestApi();
    const randomUUID = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
    try {
      render(<GuestCapture {...guestProps} />);
      resolveSession(successfulResponse());
      await waitForSessionReady();

      fireEvent.change(fileInput("Pilih foto dari galeri"), {
        target: { files: [photoFile("phone-photo.jpg")] },
      });

      expect(await screen.findByAltText(/Pratinjau foto dengan filter .* dan bingkai/)).toBeTruthy();
      const uploadButton = await screen.findByRole("button", { name: "Unggah Foto" });
      expect((uploadButton as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByAltText(/Pratinjau foto dengan filter .* dan bingkai/).compareDocumentPosition(uploadButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(uploadButton);
      await waitFor(() => expect(calls.some((call) => call.url.endsWith("/memories"))).toBe(true));

      const uploadCall = calls.find((call) => call.url.endsWith("/memories"));
      const body = uploadCall?.init?.body as FormData;
      expect(body.get("photo")).toBeInstanceOf(File);
      expect(body.get("idempotencyKey")).toMatch(/^[0-9a-f-]{36}$/i);
      expect(screen.getByRole("heading", { name: "Foto kamu sudah masuk ke galeri." })).toBeTruthy();
    } finally {
      if (randomUUID) Object.defineProperty(globalThis.crypto, "randomUUID", randomUUID);
      else Reflect.deleteProperty(globalThis.crypto, "randomUUID");
    }
  });

  it("keeps the original selected photo and explains failed uploads", async () => {
    let finishUpload!: (response: MockResponse) => void;
    const uploadResponse = new Promise<MockResponse>((resolve) => { finishUpload = resolve; });
    const { resolveSession } = mockGuestApi(uploadResponse);
    render(<GuestCapture {...guestProps} />);
    resolveSession(successfulResponse());
    await waitForSessionReady();
    await choosePhoto(photoFile());
    fireEvent.click(screen.getByRole("button", { name: "Unggah Foto" }));
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Pengunggahan foto" })).toBeTruthy());
    finishUpload({ ok: false, json: async () => ({ error: "Unggahan ditolak." }) });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Unggahan ditolak."));
    expect(screen.getByAltText(/Pratinjau foto dengan filter .* dan bingkai/)).toBeTruthy();
  });
});

describe("guest photo entry points", () => {
  it("offers a direct capture link from an empty public gallery", async () => {
    findUnique.mockResolvedValue({
      name: "Our event",
      eventDate: new Date("2026-11-09T00:00:00.000Z"),
      eventType: "BIRTHDAY",
      location: "Bangkok",
      coverImageKey: "/cover.jpg",
      privacyMode: "PUBLIC_LINK",
      status: "LIVE",
      expiresAt: null,
      startsAt: null,
      endsAt: new Date("2026-11-09T00:00:00.000Z"),
      timeZone: "UTC",
      orders: [{ id: "paid-order", packageSnapshot: null }],
      package: { name: "Paket 5", guestCapacity: 5, isUnlimited: false },
      customization: null,
      freeTrial: null,
      _count: { guestSessions: 2 },
      mediaAssets: [],
    });

    render(await GuestGalleryPage({ params: Promise.resolve({ slug: "sample-event" }) }));
    expect(screen.getByAltText("Sampul acara Our event")).toBeTruthy();
    expect(screen.getByText("Ulang tahun · Bangkok")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Our event" })).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("9 Nov")).toBeTruthy();
    expect(screen.getByText("2/5")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Bagikan momen pertama" }).getAttribute("href"))
      .toBe("/e/sample-event#capture-options");
  });

  it("opens photos with download and owner delete actions", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <GuestGallery
        slug="sample-event"
        eventName="Our event"
        canDelete
        initialAssets={[{
          id: "photo-1",
          type: "PHOTO",
          caption: "A memory",
          uploaderName: "Audrey",
          createdAt: "2026-11-06T12:00:00.000Z",
        }]}
      />,
    );

    expect(screen.getByText("Diunggah oleh Audrey")).toBeTruthy();
    expect(screen.getByText("A memory").className).toContain("truncate");
    expect(screen.getByText("A memory").className).toContain("text-sm");
    expect(screen.getByText("Diunggah oleh Audrey").className).toContain("text-[10px]");
    expect(screen.getByText("Diunggah oleh Audrey").getAttribute("style")).toContain("text-size-adjust: none");
    const gridClassName = screen.getByRole("button", { name: "Lihat foto: A memory" })
      .closest("figure")?.parentElement?.className ?? "";
    expect(gridClassName).toContain("grid-cols-2");
    expect(gridClassName).toContain("sm:grid-cols-3");
    expect(gridClassName).toContain("xl:grid-cols-5");

    fireEvent.click(screen.getByRole("button", { name: "Lihat foto: A memory" }));
    expect(screen.getByRole("dialog", { name: "Momen 1 dari 1" })).toBeTruthy();
    expect(screen.getAllByText("Diunggah oleh Audrey")).toHaveLength(2);
    expect(screen.getAllByText("A memory")[1].className).toContain("text-base");
    expect(screen.getAllByText("Diunggah oleh Audrey")[1].className).toContain("text-[10px]");
    expect(screen.getAllByText("Diunggah oleh Audrey")[1].getAttribute("style"))
      .toContain("text-size-adjust: none");
    expect(screen.getByRole("link", { name: "Unduh" }).getAttribute("href"))
      .toBe("/api/events/sample-event/media/photo-1?download=1");
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/sample-event/media/photo-1",
      expect.objectContaining({ method: "DELETE" }),
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("passes the database photo experience into the public event page", async () => {
    findUnique.mockResolvedValue({
      name: "Audrey's Party",
      eventDate: new Date("2026-11-06T12:00:00.000Z"),
      description: null,
      location: null,
      eventType: "PARTY",
      coverImageKey: "https://example.com/event-cover.jpg",
      privacyMode: "PUBLIC_LINK",
      status: "LIVE",
      expiresAt: null,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      timeZone: "UTC",
      orders: [{ id: "paid-order" }],
      mediaAssets: [],
      _count: { guestSessions: 0 },
      challenges: [],
      customization: null,
      photoExperience: { filter: "DISPOSABLE_CAM", frame: "POLAROID_WHITE" },
    });

    render(await GuestEventPage({ params: Promise.resolve({ slug: "sample-event" }) }));
    const eventHeading = screen.getByRole("heading", { name: "Audrey's Party" });
    const captureHeading = screen.getByRole("heading", { name: "Abadikan momen di Audrey's Party." });
    expect(eventHeading).toBeTruthy();
    expect(eventHeading.compareDocumentPosition(captureHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Momen yang terkumpul")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Buat acaramu/i })).toBeNull();
    expect(screen.getByRole("img", { name: "Sampul acara Audrey's Party" }).getAttribute("src"))
      .toBe("https://example.com/event-cover.jpg");
    expect(screen.getByRole("link", { name: "Bagikan Momen" }).getAttribute("href"))
      .toBe("#capture-options");
    expect(screen.getByRole("link", { name: "Lihat Galeri" }).getAttribute("href"))
      .toBe("/e/sample-event/gallery");
    expect(screen.getByText("Kumpulan momen hari ini.")).toBeTruthy();
    expect(screen.getByText("Setiap tamu punya cerita berbeda dari perayaan ini.")).toBeTruthy();
  });
});
