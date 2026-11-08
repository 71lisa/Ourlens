const EVENT_TYPE_LABELS: Record<string, string> = {
  WEDDING: "Pernikahan",
  BIRTHDAY: "Ulang tahun",
  GRADUATION: "Wisuda",
  REUNION: "Reuni",
  CORPORATE: "Acara perusahaan",
  PARTY: "Pesta",
  SCHOOL: "Acara sekolah",
  FAMILY: "Acara keluarga",
  OTHER: "Lainnya",
};

export function getEventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? "Lainnya";
}

const EVENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  UPCOMING: "Akan datang",
  LIVE: "Berlangsung",
  ONGOING: "Berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Diarsipkan",
  EXPIRED: "Kedaluwarsa",
  SCHEDULE_UNAVAILABLE: "Jadwal belum tersedia",
};

export function getEventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status] ?? "Status lainnya";
}
