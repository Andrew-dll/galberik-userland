# certs

`host.py` loads `certs/localhost.pem`, which contains **both**
the certificate and its private key (the HTTPS host loads it as a single PEM
chain).

A ready-to-use self-signed certificate is committed here, so a fresh clone can
serve HTTPS without OpenSSL. It is a local development certificate: the console
shows an untrusted-certificate prompt the first time, accept it once.

The file is versioned; if it is missing, restore it with:

```sh
git checkout -- certs/localhost.pem
```

To create a new one by hand:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem -out certs/cert.pem -days 3650 \
  -subj "/CN=manuals.playstation.net"
cat certs/cert.pem certs/key.pem > certs/localhost.pem
rm certs/key.pem certs/cert.pem
```
