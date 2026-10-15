import { decrypt, encrypt, importKey } from "../../../shared/crypto";

// Only actions call these: queries never see plaintext secrets.
export async function encryptSecret(plaintext: string): Promise<string> {
  return await encrypt(await importKey(process.env.ENCRYPTION_KEY), plaintext);
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  return await decrypt(await importKey(process.env.ENCRYPTION_KEY), ciphertext);
}
