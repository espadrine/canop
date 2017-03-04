web/cm:
	cd web && \
	  curl http://codemirror.net/codemirror.zip >cm.zip 2>/dev/null && \
	  unzip cm.zip >/dev/null && \
	  mv codemirror-* cm && \
	  rm cm.zip
