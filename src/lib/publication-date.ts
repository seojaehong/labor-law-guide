/** Publication timestamps are stored as timestamptz; display their Korean calendar date.
 * An unzoned/date-only legacy value keeps its written day rather than using the host timezone.
 */
export function formatPublicationDate(value: string, style: 'numeric' | 'long' = 'numeric'): string {
  let day = value.match(/^(\d{4})-(\d{2})-(\d{2})/)?.slice(1);
  if (/[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const timestamp = new Date(value);
    if (!Number.isNaN(timestamp.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(timestamp);
      day = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value);
    }
  }
  if (!day) return value.slice(0, 10);
  return style === 'long' ? `${day[0]}년 ${Number(day[1])}월 ${Number(day[2])}일` : day.join('.');
}
