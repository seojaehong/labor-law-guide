/** EOF is transport closure, not an application-level success acknowledgement. */
export function requireStreamCompletion(doneReceived: boolean, serverError: string | null): void {
  if (serverError) throw new Error(serverError);
  if (!doneReceived) throw new Error('응답이 완료되기 전에 연결이 종료되었습니다. 다시 시도해 주세요.');
}
