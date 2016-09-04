#!/bin/bash

world='GiantMap.png'
worldWidth=8192
worldHeight=8192

tileWidth=1024
tileHeight=1024
tileDirectory="tiles"

medTileWidth=512
medTileHeight=512
medTileDirectory="t512"

smlTileWidth=256
smlTileHeight=256
smlTileDirectory="t256"

width=$((worldWidth/tileWidth))
height=$((worldHeight/tileHeight))

offsetX=0
offsetY=4

i=0
totalTiles=$((width*height))

mkdir ${tileDirectory} &> /dev/null
mkdir ${medTileDirectory} &> /dev/null
mkdir ${smlTileDirectory} &> /dev/null

for y in $(seq 1 $height); do
   for x in $(seq 1 $width); do
      tile="$(((x+offsetX)-1)),$((height-(y+offsetY))).png"
      convert -crop ${tileWidth}x${tileHeight}+$((tileWidth*(x-1)))+$((tileHeight*(y-1))) $world ${tileDirectory}/${tile}
      convert -resize ${medTileWidth}x${medTileHeight} ${tileDirectory}/${tile} ${medTileDirectory}/${tile}
      convert -resize ${smlTileWidth}x${smlTileHeight} ${tileDirectory}/${tile} ${smlTileDirectory}/${tile}
      i=$((i+1))
      echo -e "$i/$totalTiles" >> gen.log
   done
done



