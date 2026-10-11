# ADR 0002: SeaweedFS statt MinIO für lokalen S3-Speicher

Status: akzeptiert (M0)

**Kontext:** Die Spezifikation nennt MinIO für die lokale Entwicklung. Die öffentlichen MinIO-Images (Docker Hub `minio/minio`, `quay.io/minio/minio`) sind nicht mehr abrufbar (Pull verweigert).

**Entscheidung:** Lokal läuft SeaweedFS (`chrislusf/seaweedfs`, Apache-2.0) mit S3-API auf Port 9000 und fester Entwicklungs-Identität (`infra/seaweedfs-s3.json`).
Die Anwendung spricht nur das S3-Protokoll (Umgebungsvariablen `S3_*`), Produktion nutzt einen S3-kompatiblen EU-Speicher.

**Folgen:** Der Bucket wird beim ersten Zugriff durch die Datei-Schicht angelegt (ab M5). Andere Dienste (RustFS, Garage) wären ebenfalls austauschbar.
