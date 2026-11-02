// @vitest-environment jsdom

import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestCapture } from "@/features/memories/guest-capture";
import GuestEventPage from "@/app/e/[slug]/page";
import GuestGalleryPage from "@/app/e/[slug]/gallery/page";

const { renderPhoto, findUnique } = vi.hoisted(() => ({
  renderPhoto: vi.fn(),
  findUnique: vi.fn(),
}));

class TestFormData {
  private readonly values = new Map<string, string | Blob>();

  set(name: string, value: string | Blob) {
    this.values.set(name, value);
  }

  get(name: string) {
    return this.values.get(name) ?? null;
  }
}

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const imageProps = { ...props };
    delete imageProps.unoptimized;
    return createElement("img", imageProps);
  },
}));

vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    createElement("a", props, props.children),
}));

vi.mock("@/services/media/image-processing/local-canvas", () => ({
  getLocalImageProcessingService: () => ({ renderPhoto }),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { event: { findUnique } },
}));

vi.mock("@/server/authorization/policies", () => ({
  canAcceptGuestContributions: () => true,
  canAccessGuestEventPage: () => true,
  canViewEventGallery: () => true,
  getEffectiveGuestEventStatus: () => "LIVE",
  PUBLIC_GALLERY_MODERATION_STATUSES: ["APPROVED"],
}));

type MockResponse = {
  ok: boolean;
  json: () => Promise<{ error?: string }>;
};

type FetchCall = { url: string; init?: RequestInit };

function mockGuestApi(uploadResponse?: Promise<MockResponse>) {
  const calls: FetchCall[] = [];
  let resolveSession!: (response: MockResponse) => void;
  const sessionResponse = new Promise<MockResponse>((resolve) => {
    resolveSession = resolve;
  });
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/guest-session")) return sessionResponse;
    return uploadResponse ?? Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, resolveSession };
}

function fileInput(label: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`Missing file input: ${label}`);
  return input;
}

function photoFile(name: string, type: string) {
  const signature = type === "image/png"
    ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    : type === "image/webp"
      ? [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
      : [0xff, 0xd8, 0xff, 0x01];
  return new File([new Uint8Array(signature)], name, { type });
}

async function choosePhoto(file: File) {
  fireEvent.change(fileInput("Choose a photo from gallery"), { target: { files: [file] } });
  await waitFor(() => {
    if (!screen.queryByRole("region", { name: "Media Studio" }) && !screen.queryByRole("alert")) {
      throw new Error("Photo selection is still being prepared.");
    }
  });
}

function chooseVideo(file: File) {
  fireEvent.change(fileInput("Choose a video from gallery"), { target: { files: [file] } });
}

const successfulResponse = (): MockResponse => ({ ok: true, json: async () => ({}) });

async function waitForSessionReady() {
  await waitFor(() => expect(screen.queryByText("Getting your guest space ready…")).toBeNull());
}

let originalCreateObjectURL: PropertyDescriptor | undefined;
let originalRevokeObjectURL: PropertyDescriptor | undefined;
let nextObjectUrl = 0;

beforeEach(() => {
  vi.stubGlobal("FormData", TestFormData);
  renderPhoto.mockReset();
  findUnique.mockReset();
  renderPhoto.mockResolvedValue({
    type: "image/jpeg",
    size: 4,
    arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x01]).buffer,
  } as Blob);
  originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  nextObjectUrl = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => `blob:ourlens-test-${++nextObjectUrl}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("guest capture file selection", () => {
  it("opens directly on the Photo and Live Moment choices", () => {
    mockGuestApi();
    render(<GuestCapture slug="sample-event" />);

    expect(screen.getByRole("heading", { name: "Choose a memory type" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Live Moment" })).toBeTruthy();
  });

  it("opens the dedicated photo and video pickers synchronously from their buttons", () => {
    mockGuestApi();
    render(<GuestCapture slug="sample-event" />);

    const photoCamera = fileInput("Choose a photo from camera");
    const photoGallery = fileInput("Choose a photo from gallery");
    const photoCameraClick = vi.fn();
    const photoGalleryClick = vi.fn();
    photoCamera.addEventListener("click", photoCameraClick);
    photoGallery.addEventListener("click", photoGalleryClick);

    for (const input of [photoCamera, photoGallery]) {
      expect(input.isConnected && !input.disabled).toBe(true);
      expect(input.style.opacity).toBe("0");
      expect(getComputedStyle(input).opacity).toBe("0");
      expect(input.style.position).toBe("absolute");
      expect(input.style.inset).toBe("0");
      expect(input.style.width).toBe("100%");
      expect(input.style.height).toBe("100%");
      expect(input.style.zIndex).toBe("1");
      expect(input.parentElement?.tagName).toBe("LABEL");
    }
    expect(photoCamera.parentElement).not.toBe(photoGallery.parentElement);
    fireEvent.click(photoCamera);
    expect(photoCameraClick).toHaveBeenCalledOnce();
    expect(photoGalleryClick).not.toHaveBeenCalled();
    fireEvent.click(photoGallery);
    expect(photoGalleryClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Live Moment" }));
    const videoCamera = fileInput("Choose a video from camera");
    const videoGallery = fileInput("Choose a video from gallery");
    const videoCameraClick = vi.fn();
    const videoGalleryClick = vi.fn();
    videoCamera.addEventListener("click", videoCameraClick);
    videoGallery.addEventListener("click", videoGalleryClick);
    for (const input of [videoCamera, videoGallery]) {
      expect(input.isConnected && !input.disabled).toBe(true);
      expect(input.style.opacity).toBe("0");
      expect(getComputedStyle(input).opacity).toBe("0");
      expect(input.style.position).toBe("absolute");
      expect(input.style.inset).toBe("0");
      expect(input.style.width).toBe("100%");
      expect(input.style.height).toBe("100%");
      expect(input.style.zIndex).toBe("1");
      expect(input.parentElement?.tagName).toBe("LABEL");
    }
    expect(videoCamera.parentElement).not.toBe(videoGallery.parentElement);
    fireEvent.click(videoCamera);
    expect(videoCameraClick).toHaveBeenCalledOnce();
    fireEvent.click(videoGallery);
    expect(videoGalleryClick).toHaveBeenCalledOnce();

    expect(videoGallery.accept).toContain(".mp4");
    expect(videoCamera.getAttribute("capture")).toBe("environment");
  });

  it.each([
    { format: "MP4", fileName: "moment.mp4", mimeType: "video/mp4" },
    { format: "MOV", fileName: "moment.mov", mimeType: "video/quicktime" },
  ])("previews a selected $format video and uploads it as VIDEO only after Share Memory", async ({ fileName, mimeType }) => {
    const { calls, resolveSession } = mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    resolveSession(successfulResponse());
    await waitForSessionReady();
    fireEvent.click(screen.getByRole("button", { name: "Live Moment" }));
    const video = new File(["video-data"], fileName, { type: mimeType });
    chooseVideo(video);

    expect(URL.createObjectURL).toHaveBeenCalledWith(video);
    expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:ourlens-test-1");
    expect((document.querySelector("video") as HTMLVideoElement).controls).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use This Live Moment" }));
    expect(calls.filter((call) => call.url.endsWith("/memories"))).toHaveLength(0);
    expect(screen.getByText("Live Moment video")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Share Memory" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/memories"))).toBe(true));
    const uploadCall = calls.find((call) => call.url.endsWith("/memories"));
    const body = uploadCall?.init?.body as FormData;
    expect(body.get("kind")).toBe("video");
    expect(body.get("video")).toBeInstanceOf(File);
  });

  it("previews a selected photo in Media Studio and retains it when session setup completes", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    const photo = photoFile("memory.jpg", "image/jpeg");
    await choosePhoto(photo);

    expect(URL.createObjectURL).toHaveBeenCalledWith(photo);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText("Getting your guest space ready…")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Media Studio" })).toBeTruthy();
    expect(screen.getByAltText("Photo edit preview").getAttribute("src")).toBe("blob:ourlens-test-1");
    expect(screen.queryByText(photo.name)).toBeNull();
    resolveSession(successfulResponse());
    await waitFor(() => expect(screen.getByRole("region", { name: "Media Studio" })).toBeTruthy());
    expect(screen.getByAltText("Photo edit preview").getAttribute("src")).toBe("blob:ourlens-test-1");
  });

  it("uses a newly selected photo for the updated preview and Media Studio edits", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    resolveSession(successfulResponse());
    await waitForSessionReady();
    const firstPhoto = photoFile("first.jpg", "image/jpeg");
    await choosePhoto(firstPhoto);
    expect(screen.getByAltText("Photo edit preview").getAttribute("src")).toBe("blob:ourlens-test-1");

    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    const secondPhoto = photoFile("second.png", "image/png");
    await choosePhoto(secondPhoto);
    expect(screen.getByAltText("Photo edit preview").getAttribute("src")).toBe("blob:ourlens-test-2");

    fireEvent.click(screen.getByRole("button", { name: "Share Memory" }));
    await waitFor(() => expect(renderPhoto).toHaveBeenCalledTimes(1));
    expect(renderPhoto).toHaveBeenCalledWith(secondPhoto, {
      filter: "original",
      frame: "none",
      enhanced: false,
    });
  });

  it("recognizes a valid photo by its bytes when iOS omits or misreports MIME metadata", async () => {
    const { resolveSession } = mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    resolveSession(successfulResponse());
    await waitForSessionReady();
    const photo = photoFile("IMG_6603.bin", "");
    await choosePhoto(photo);

    expect(screen.getByAltText("Photo edit preview").getAttribute("src")).toBe("blob:ourlens-test-1");
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ name: "IMG_6603.jpg", type: "image/jpeg" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Share Memory" }));
    await waitFor(() => expect(renderPhoto).toHaveBeenCalledTimes(1));
    const mediaStudioFile = renderPhoto.mock.calls[0][0] as File;
    expect(mediaStudioFile.name).toBe("IMG_6603.jpg");
    expect(mediaStudioFile.type).toBe("image/jpeg");
  });

  it("allows photo selection while session loads but waits for session before upload", async () => {
    const { calls } = mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    const photo = photoFile("memory.jpg", "image/jpeg");
    await choosePhoto(photo);

    const shareButton = screen.getByRole("button", { name: "Preparing guest session…" }) as HTMLButtonElement;
    expect(shareButton.disabled).toBe(true);
    fireEvent.click(shareButton);
    expect(calls.some((call) => call.url.endsWith("/memories"))).toBe(false);
  });

  it("accepts selected files from the camera inputs for both media modes", async () => {
    mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    const photo = photoFile("camera.jpg", "image/jpeg");
    fireEvent.change(fileInput("Choose a photo from camera"), { target: { files: [photo] } });

    await waitFor(() => expect(screen.getByRole("region", { name: "Media Studio" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    fireEvent.click(screen.getByRole("button", { name: "Live Moment" }));
    const video = new File(["video-data"], "camera.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput("Choose a video from camera"), { target: { files: [video] } });

    expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:ourlens-test-2");
  });

  it("passes the selected photo through editing and uploads only on explicit confirmation", async () => {
    const { calls, resolveSession } = mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    resolveSession(successfulResponse());
    await waitForSessionReady();
    const photo = photoFile("memory.jpg", "image/jpeg");
    await choosePhoto(photo);
    fireEvent.click(screen.getByRole("button", { name: "Warm" }));
    fireEvent.click(screen.getByRole("tab", { name: "frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Polaroid" }));
    fireEvent.click(screen.getByRole("tab", { name: "enhance" }));
    fireEvent.click(screen.getByRole("button", { name: "Enhanced" }));
    expect(screen.getByRole("button", { name: "Share Memory" })).toBeTruthy();
    expect(renderPhoto).not.toHaveBeenCalled();
    expect(calls.filter((call) => call.url.endsWith("/memories"))).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText("Best day ever…"), {
      target: { value: "Our day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share Memory" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/memories"))).toBe(true));
    expect(renderPhoto).toHaveBeenCalledWith(photo, {
      filter: "warm",
      frame: "polaroid",
      enhanced: true,
    });

    const uploadCall = calls.find((call) => call.url.endsWith("/memories"));
    const body = uploadCall?.init?.body as FormData;
    expect(body.get("kind")).toBe("photo");
    expect(body.get("photo")).toBeInstanceOf(File);
    expect(body.get("original")).toBe(photo);
    expect(body.get("caption")).toBe("Our day");
  });

  it("does not error or leave the selection screen when the picker is cancelled", () => {
    mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    fireEvent.change(fileInput("Choose a photo from gallery"), { target: { files: [] } });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Choose from gallery")).toBeTruthy();
  });

  it("explains invalid files instead of silently rejecting them", async () => {
    mockGuestApi();
    render(<GuestCapture slug="sample-event" />);
    await choosePhoto(new File(["not an image"], "notes.txt", { type: "text/plain" }));

    expect(screen.getByRole("alert").textContent).toContain("This photo format isn’t supported.");
  });

  it("shows upload progress and keeps the selected photo available when upload fails", async () => {
    let finishUpload!: (response: MockResponse) => void;
    const uploadResponse = new Promise<MockResponse>((resolve) => {
      finishUpload = resolve;
    });
    const { resolveSession } = mockGuestApi(uploadResponse);
    render(<GuestCapture slug="sample-event" />);
    resolveSession(successfulResponse());
    await waitForSessionReady();
    await choosePhoto(photoFile("memory.jpg", "image/jpeg"));
    fireEvent.click(screen.getByRole("button", { name: "Share Memory" }));

    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Memory upload" })).toBeTruthy());
    finishUpload({ ok: false, json: async () => ({ error: "Upload rejected." }) });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Upload rejected."));
    expect(screen.getByAltText("Photo edit preview")).toBeTruthy();
  });
});

describe("guest capture entry points", () => {
  it("uses the empty-gallery Add the first memory link as the direct capture entry", async () => {
    findUnique.mockResolvedValue({
      name: "Our event",
      privacyMode: "PUBLIC",
      status: "LIVE",
      expiresAt: null,
      startsAt: null,
      endsAt: null,
      timeZone: "UTC",
      orders: [{ id: "paid-order" }],
      mediaAssets: [],
    });

    render(await GuestGalleryPage({ params: Promise.resolve({ slug: "sample-event" }) }));

    expect(screen.getByRole("link", { name: "Add the first memory" }).getAttribute("href"))
      .toBe("/e/sample-event#capture-options");
    expect(screen.queryByRole("link", { name: "Capture a Memory" })).toBeNull();
  });

  it("links the main Capture a Memory entry straight to the media choices", async () => {
    findUnique.mockResolvedValue({
      name: "Our event",
      eventDate: null,
      description: null,
      location: null,
      eventType: "WEDDING",
      coverImageKey: null,
      privacyMode: "PUBLIC",
      status: "LIVE",
      expiresAt: null,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      timeZone: "UTC",
      orders: [{ id: "paid-order" }],
      challenges: [],
      customization: null,
    });

    render(await GuestEventPage({ params: Promise.resolve({ slug: "sample-event" }) }));

    expect(screen.getByRole("link", { name: "Capture a Memory" }).getAttribute("href"))
      .toBe("#capture-options");
  });
});
