-- Adiciona cadastro espacial sem alterar ou excluir dados existentes.
CREATE TABLE "HydraulicMap" (
 "siteId" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "layout" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version">=0),
 "updatedBy" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "HydraulicMap_pkey" PRIMARY KEY ("siteId"),
 CONSTRAINT "HydraulicMap_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
