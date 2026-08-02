FROM postgres:18-alpine

RUN apk add --no-cache curl tzdata

# Backups are named for the day they cover, so they should be named in the
# timezone you actually live in — otherwise an evening run lands under
# tomorrow's date. Alpine needs tzdata for named zones; without it this
# silently falls back to UTC.
ENV TZ=America/Lima

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

CMD ["/usr/local/bin/backup.sh"]
