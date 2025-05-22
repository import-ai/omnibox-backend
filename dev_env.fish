set -x OBB_PORT 9005
set -x OBB_DB_HOST localhost
set -x OBB_DB_PORT 5432
set -x OBB_DB_DATABASE devdb
set -x OBB_DB_USERNAME devuser
set -x OBB_DB_PASSWORD devpass
set -x OBB_DB_LOGGING true
set -x OBB_DB_SYNC true
set -x OBB_JWT_SECRET your-secret-key
set -x OBB_JWT_EXPIRE 3600s
set -x OBB_MAIL_TRANSPORT smtps://dev.no-reply@notify.omnibox.pro:31onYzOLletVooMe@smtpdm.aliyun.com:465
set -x OBB_MAIL_FROM "No Reply <dev.no-reply@notify.omnibox.pro>"
set -x OBB_WIZARD_BASE_URL http://localhost:5174
set -x OBB_MINIO_ENDPOINT http://username:password@localhost:9000
