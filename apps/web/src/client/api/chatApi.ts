export async function sendChatMessage(
  apiBaseUrl: string,
  message: string,
  file?: File | null,
) {
  const formData = new FormData();
  formData.append('message', message);

  if (file) {
    formData.append('attachment', file);
  }

  const response = await fetch(`${apiBaseUrl}/api/messages`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Send failed: ${response.status}`);
  }

  return response.json();
}
