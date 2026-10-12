import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Tx } from '@sp/db';
import { ENV, type Env } from '../../config/env';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 120;

/** Erlaubte Typen, erkannt am Dateiinhalt (nicht am mitgeschickten Typ). */
export function sniffMime(buf: Buffer): string | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => buf[at + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  // HEIC/HEIF (iPhone-Fotos): "ftyp" ab Byte 4 mit Marke heic/heix/mif1
  if (starts([0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'mif1', 'heif'].includes(brand)) return 'image/heic';
  }
  return null;
}

/** Ablage der Dateien; im Test durch einen Speicher im Arbeitsspeicher ersetzbar. */
@Injectable()
export class ObjectStore implements OnModuleInit {
  private readonly logger = new Logger(ObjectStore.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: 'eu-central-1',
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  /** Bucket anlegen, falls er fehlt (lokal; in Produktion existiert er). Fehler nur protokollieren. */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (err) {
        this.logger.warn(
          `Dateispeicher nicht erreichbar: ${err instanceof Error ? err.message : ''}`,
        );
      }
    }
  }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }),
    );
  }

  /** Kurzlebiger, signierter Link (kein öffentlicher Speicher). */
  async signedUrl(key: string, fileName: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename="${fileName}"`,
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }
}

export type ScanResult = 'CLEAN' | 'INFECTED' | 'SKIPPED';

/** Virenscan über clamd (INSTREAM). Ohne Konfiguration: in Produktion ablehnen, lokal überspringen. */
@Injectable()
export class VirusScanner {
  private readonly logger = new Logger(VirusScanner.name);
  private readonly url: URL | null;
  private readonly required: boolean;

  constructor(@Inject(ENV) env: Env) {
    this.url = env.CLAMAV_URL ? new URL(env.CLAMAV_URL) : null;
    this.required =
      env.UPLOADS_REQUIRE_SCAN === undefined
        ? process.env.NODE_ENV === 'production'
        : env.UPLOADS_REQUIRE_SCAN === 'true';
  }

  async scan(buf: Buffer): Promise<ScanResult> {
    if (!this.url) {
      if (this.required)
        throw new ServiceUnavailableException({
          title: 'Virenscan nicht verfügbar, bitte später erneut',
        });
      this.logger.warn('Upload ohne Virenscan angenommen (nur Entwicklung, CLAMAV_URL fehlt)');
      return 'SKIPPED';
    }
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(this.url!.port || 3310), this.url!.hostname);
      let out = '';
      socket.setTimeout(30_000, () => socket.destroy(new Error('Zeitüberschreitung')));
      socket.on('data', (d) => (out += d.toString()));
      socket.on('end', () => resolve(out));
      socket.on('error', reject);
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < buf.length; i += 64 * 1024) {
          const chunk = buf.subarray(i, i + 64 * 1024);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          socket.write(len);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    }).catch(() => {
      throw new ServiceUnavailableException({
        title: 'Virenscan nicht verfügbar, bitte später erneut',
      });
    });
    if (/FOUND/.test(reply)) return 'INFECTED';
    if (/OK/.test(reply)) return 'CLEAN';
    throw new ServiceUnavailableException({ title: 'Virenscan fehlgeschlagen' });
  }
}

/** Uploads (Spec Abschnitt 13): Typ- und Größenprüfung, Virenscan, nur signierte Links, Metadaten in FileAsset. */
@Injectable()
export class FilesService {
  constructor(
    private readonly store: ObjectStore,
    private readonly scanner: VirusScanner,
  ) {}

  async upload(tx: Tx, tenantId: string, ownerId: string, body: Buffer): Promise<{ id: string }> {
    if (body.length === 0) throw new UnprocessableEntityException({ title: 'Leere Datei' });
    if (body.length > MAX_UPLOAD_BYTES)
      throw new UnprocessableEntityException({ title: 'Datei zu groß (höchstens 5 MB)' });
    const mime = sniffMime(body);
    if (!mime)
      throw new UnprocessableEntityException({
        title: 'Nur Fotos (JPEG, PNG, WebP, HEIC) oder PDF',
      });
    const scan = await this.scanner.scan(body);
    if (scan === 'INFECTED')
      throw new UnprocessableEntityException({ title: 'Die Datei wurde als gefährlich erkannt' });
    const key = `${tenantId}/${randomUUID()}`;
    await this.store.put(key, body, mime);
    return tx.fileAsset.create({
      data: {
        tenantId,
        key,
        mime,
        size: body.length,
        ownerId,
        scanStatus: scan,
        scannedAt: scan === 'CLEAN' ? new Date() : null,
      },
      select: { id: true },
    });
  }

  async link(tx: Tx, fileId: string): Promise<string | null> {
    const f = await tx.fileAsset.findUnique({ where: { id: fileId } });
    if (!f || f.scanStatus === 'INFECTED' || f.scanStatus === 'PENDING') return null;
    const ext = f.mime === 'application/pdf' ? 'pdf' : f.mime.split('/')[1];
    return this.store.signedUrl(f.key, `bestaetigung.${ext}`);
  }
}
