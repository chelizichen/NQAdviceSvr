rm -rf ./TradeServer.tar.gz

tsc -p tsconfig.build.json

cp ./package.json ./dist
cp ./package-lock.json ./dist
cp ./config.env ./dist

# force dist package.json to commonjs for Node compatibility
sed -i '' 's/"type": "module"/"type": "commonjs"/' ./dist/package.json || true

cp -rf ./public ./dist
# cp -rf ./data ./dist

cd ./dist
npm i --production
tar -czvf TradeServer.tar.gz ./*
mv TradeServer.tar.gz ../