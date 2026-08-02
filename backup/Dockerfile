FROM postgres:18-alpine

RUN apk add --no-cache curl

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

CMD ["/usr/local/bin/backup.sh"]
