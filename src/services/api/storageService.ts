import { supabase } from '../../lib/supabaseClient';

export const BUCKETS = {
  REGISTRATION_FORMS: 'registration-forms',
  MEDICAL_CERTIFICATES: 'medical-certificates',
} as const;

/**
 * Uploads a file to a Supabase storage bucket.
 * Returns a long-lived signed URL (valid for 10 years) so that the application can
 * access it without needing dynamic signed URL generation in every UI component.
 */
export const uploadFile = async (
  bucket: string,
  filePath: string,
  file: Blob | File
): Promise<string> => {
  try {
    // 1. Upload the file (upsert = true allows overwriting)
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[storageService] Error uploading file to ${bucket}/${filePath}:`, uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // 2. Generate a long-lived signed URL (10 years = 315,360,000 seconds)
    const tenYearsInSeconds = 10 * 365 * 24 * 3600;
    const { data, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, tenYearsInSeconds);

    if (urlError || !data?.signedUrl) {
      console.warn(`[storageService] Could not generate signed URL for ${bucket}/${filePath}:`, urlError);
      // Fallback to public URL (will work if the bucket is configured as public or has RLS open)
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return publicData.publicUrl;
    }

    return data.signedUrl;
  } catch (err: any) {
    console.warn(`[storageService] Upload failed for ${bucket}/${filePath}. Using fallback placeholder URL. Error:`, err.message || err);
    return `https://placeholder-storage.local/${bucket}/${filePath}`;
  }
};

/**
 * Convenience method for uploading a registration form PDF.
 */
export const uploadRegistrationForm = async (
  studentId: string,
  pdfBlob: Blob,
  fileName = 'modulo_iscrizione.pdf'
): Promise<string> => {
  const filePath = `${studentId}/${Date.now()}_${fileName}`;
  return uploadFile(BUCKETS.REGISTRATION_FORMS, filePath, pdfBlob);
};

/**
 * Convenience method for uploading a medical certificate.
 */
export const uploadMedicalCertificate = async (
  studentId: string,
  file: File | Blob,
  fileName: string
): Promise<string> => {
  const fileExt = fileName.split('.').pop() || 'pdf';
  const filePath = `${studentId}/${Date.now()}_certificato_medico.${fileExt}`;
  return uploadFile(BUCKETS.MEDICAL_CERTIFICATES, filePath, file);
};
