SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS `__DB_NAME__`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE `__DB_NAME__`;

CREATE TABLE IF NOT EXISTS `MTRD_Proyecto` (
  `MTRD_Proyecto_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del proyecto',
  `MTRD_Proyecto_UID` CHAR(36) NOT NULL COMMENT 'UID del proyecto en frontend',
  `MTRD_Proyecto_Nombre` VARCHAR(180) NOT NULL COMMENT 'Nombre del proyecto',
  `MTRD_Proyecto_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion del proyecto',
  `MTRD_Proyecto_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del proyecto',
  `MTRD_Proyecto_Estado` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Estado logico del proyecto',
  PRIMARY KEY (`MTRD_Proyecto_ID`),
  UNIQUE KEY `UQ_MTRD_Proyecto_UID` (`MTRD_Proyecto_UID`)
) ENGINE=InnoDB COMMENT='Proyectos de Itemicostos';

CREATE TABLE IF NOT EXISTS `MTRD_Item` (
  `MTRD_Item_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del item',
  `MTRD_Item_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto del item',
  `MTRD_Item_UID` CHAR(36) NOT NULL COMMENT 'UID del item en frontend',
  `MTRD_Item_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden secuencial del item en la grilla',
  `MTRD_Item_Nivel` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Nivel jerarquico del item',
  `MTRD_Item_Codificacion` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'Codificacion editable',
  `MTRD_Item_Descripcion` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Descripcion del item',
  `MTRD_Item_Unidad` VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'Unidad del item',
  `MTRD_Item_Costo` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Costo unitario del item',
  `MTRD_Item_MetradoTradicional` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Metrado tradicional',
  `MTRD_Item_MetradoBim` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Metrado BIM',
  `MTRD_Item_TipoMetrado` VARCHAR(30) NOT NULL DEFAULT '' COMMENT 'Tipo de metrado',
  `MTRD_Item_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion del item',
  `MTRD_Item_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del item',
  PRIMARY KEY (`MTRD_Item_ID`),
  UNIQUE KEY `UQ_MTRD_Item_Proyecto_UID` (`MTRD_Item_KEY_Proyecto`,`MTRD_Item_UID`),
  UNIQUE KEY `UQ_MTRD_Item_Proyecto_Orden` (`MTRD_Item_KEY_Proyecto`,`MTRD_Item_Orden`),
  CONSTRAINT `FK_MTRD_Item_Proyecto`
    FOREIGN KEY (`MTRD_Item_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Items jerarquicos por proyecto';

CREATE TABLE IF NOT EXISTS `MTRD_ItemColapsado` (
  `MTRD_ItemColapsado_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna de estado colapsado',
  `MTRD_ItemColapsado_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_ItemColapsado_KEY_Item` BIGINT UNSIGNED NOT NULL COMMENT 'FK al item colapsado',
  `MTRD_ItemColapsado_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de registro del colapsado',
  PRIMARY KEY (`MTRD_ItemColapsado_ID`),
  UNIQUE KEY `UQ_MTRD_ItemColapsado_Proyecto_Item` (`MTRD_ItemColapsado_KEY_Proyecto`,`MTRD_ItemColapsado_KEY_Item`),
  CONSTRAINT `FK_MTRD_ItemColapsado_Proyecto`
    FOREIGN KEY (`MTRD_ItemColapsado_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_ItemColapsado_Item`
    FOREIGN KEY (`MTRD_ItemColapsado_KEY_Item`) REFERENCES `MTRD_Item` (`MTRD_Item_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Items colapsados por proyecto';

CREATE TABLE IF NOT EXISTS `MTRD_AuditoriaItem` (
  `MTRD_AuditoriaItem_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna de auditoria',
  `MTRD_AuditoriaItem_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto del evento',
  `MTRD_AuditoriaItem_KEY_Item` BIGINT UNSIGNED NULL COMMENT 'FK al item del evento',
  `MTRD_AuditoriaItem_ItemUID` CHAR(36) NOT NULL COMMENT 'UID del item para trazabilidad historica',
  `MTRD_AuditoriaItem_Tipo` VARCHAR(20) NOT NULL COMMENT 'Tipo de evento field o structure',
  `MTRD_AuditoriaItem_Campo` VARCHAR(60) NOT NULL COMMENT 'Campo afectado',
  `MTRD_AuditoriaItem_ValorAntes` TEXT NULL COMMENT 'Valor anterior',
  `MTRD_AuditoriaItem_ValorDespues` TEXT NULL COMMENT 'Valor nuevo',
  `MTRD_AuditoriaItem_NivelAntes` INT NULL COMMENT 'Nivel anterior',
  `MTRD_AuditoriaItem_NivelDespues` INT NULL COMMENT 'Nivel nuevo',
  `MTRD_AuditoriaItem_PartidaAntes` VARCHAR(60) NULL COMMENT 'Partida anterior',
  `MTRD_AuditoriaItem_PartidaDespues` VARCHAR(60) NULL COMMENT 'Partida nueva',
  `MTRD_AuditoriaItem_UsuarioNombre` VARCHAR(120) NOT NULL COMMENT 'Nombre del operador',
  `MTRD_AuditoriaItem_FechaEvento` DATETIME NOT NULL COMMENT 'Fecha y hora del evento',
  PRIMARY KEY (`MTRD_AuditoriaItem_ID`),
  KEY `IX_MTRD_AuditoriaItem_Proyecto_Fecha` (`MTRD_AuditoriaItem_KEY_Proyecto`,`MTRD_AuditoriaItem_FechaEvento`),
  KEY `IX_MTRD_AuditoriaItem_ItemUID_Fecha` (`MTRD_AuditoriaItem_ItemUID`,`MTRD_AuditoriaItem_FechaEvento`),
  CONSTRAINT `FK_MTRD_AuditoriaItem_Proyecto`
    FOREIGN KEY (`MTRD_AuditoriaItem_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_AuditoriaItem_Item`
    FOREIGN KEY (`MTRD_AuditoriaItem_KEY_Item`) REFERENCES `MTRD_Item` (`MTRD_Item_ID`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Auditoria de ediciones de items';

CREATE TABLE IF NOT EXISTS `MTRD_Snapshot` (
  `MTRD_Snapshot_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del snapshot',
  `MTRD_Snapshot_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto del snapshot',
  `MTRD_Snapshot_UID` CHAR(36) NOT NULL COMMENT 'UID del snapshot en frontend',
  `MTRD_Snapshot_Nombre` VARCHAR(180) NOT NULL COMMENT 'Nombre del snapshot',
  `MTRD_Snapshot_NumeroVersion` INT UNSIGNED NOT NULL COMMENT 'Numero de version visible',
  `MTRD_Snapshot_Tipo` VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT 'Tipo del snapshot',
  `MTRD_Snapshot_KEY_SnapshotBase` BIGINT UNSIGNED NULL COMMENT 'FK al snapshot base de comparacion',
  `MTRD_Snapshot_UsuarioNombre` VARCHAR(120) NOT NULL COMMENT 'Usuario creador del snapshot',
  `MTRD_Snapshot_CreadoEn` DATETIME NOT NULL COMMENT 'Fecha de creacion del snapshot',
  `MTRD_Snapshot_RowCount` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de filas del snapshot',
  `MTRD_Snapshot_RootCount` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de partidas raiz',
  `MTRD_Snapshot_LeafCount` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de partidas hoja',
  `MTRD_Snapshot_GrandTotal` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Total general del snapshot',
  `MTRD_Snapshot_MetradoTradicionalTotal` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Total de metrado tradicional del snapshot',
  `MTRD_Snapshot_MetradoBimTotal` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Total de metrado BIM del snapshot',
  PRIMARY KEY (`MTRD_Snapshot_ID`),
  UNIQUE KEY `UQ_MTRD_Snapshot_Proyecto_UID` (`MTRD_Snapshot_KEY_Proyecto`,`MTRD_Snapshot_UID`),
  UNIQUE KEY `UQ_MTRD_Snapshot_Proyecto_Version` (`MTRD_Snapshot_KEY_Proyecto`,`MTRD_Snapshot_NumeroVersion`),
  CONSTRAINT `FK_MTRD_Snapshot_Proyecto`
    FOREIGN KEY (`MTRD_Snapshot_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_Snapshot_Base`
    FOREIGN KEY (`MTRD_Snapshot_KEY_SnapshotBase`) REFERENCES `MTRD_Snapshot` (`MTRD_Snapshot_ID`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Snapshots de presupuesto por proyecto';

CREATE TABLE IF NOT EXISTS `MTRD_SnapshotItem` (
  `MTRD_SnapshotItem_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del item de snapshot',
  `MTRD_SnapshotItem_KEY_Snapshot` BIGINT UNSIGNED NOT NULL COMMENT 'FK al snapshot',
  `MTRD_SnapshotItem_ItemUID` CHAR(36) NOT NULL COMMENT 'UID original del item',
  `MTRD_SnapshotItem_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden de fila en snapshot',
  `MTRD_SnapshotItem_Nivel` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Nivel jerarquico',
  `MTRD_SnapshotItem_Codificacion` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'Codificacion del item',
  `MTRD_SnapshotItem_Descripcion` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Descripcion del item',
  `MTRD_SnapshotItem_Unidad` VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'Unidad del item',
  `MTRD_SnapshotItem_Costo` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Costo del item',
  `MTRD_SnapshotItem_MetradoTradicional` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Metrado tradicional del item',
  `MTRD_SnapshotItem_MetradoBim` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Metrado BIM del item',
  `MTRD_SnapshotItem_TipoMetrado` VARCHAR(30) NOT NULL DEFAULT '' COMMENT 'Tipo de metrado del item',
  PRIMARY KEY (`MTRD_SnapshotItem_ID`),
  UNIQUE KEY `UQ_MTRD_SnapshotItem_Snapshot_Orden` (`MTRD_SnapshotItem_KEY_Snapshot`,`MTRD_SnapshotItem_Orden`),
  KEY `IX_MTRD_SnapshotItem_Snapshot_ItemUID` (`MTRD_SnapshotItem_KEY_Snapshot`,`MTRD_SnapshotItem_ItemUID`),
  CONSTRAINT `FK_MTRD_SnapshotItem_Snapshot`
    FOREIGN KEY (`MTRD_SnapshotItem_KEY_Snapshot`) REFERENCES `MTRD_Snapshot` (`MTRD_Snapshot_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Items congelados por snapshot';

CREATE TABLE IF NOT EXISTS `MTRD_RevitExport` (
  `MTRD_RevitExport_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del lote de exportacion Revit',
  `MTRD_RevitExport_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto destino',
  `MTRD_RevitExport_UID` CHAR(36) NOT NULL COMMENT 'UID del lote exportado desde addin',
  `MTRD_RevitExport_DocumentoUID` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'UID del documento Revit',
  `MTRD_RevitExport_ModeloGUID` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'GUID del modelo Revit',
  `MTRD_RevitExport_RutaModelo` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Ruta o identificador del modelo',
  `MTRD_RevitExport_RevitVersion` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Version de Revit origen',
  `MTRD_RevitExport_AddinVersion` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Version del addin exportador',
  `MTRD_RevitExport_UsuarioNombre` VARCHAR(120) NOT NULL DEFAULT 'Revit Addin' COMMENT 'Usuario reportado por el addin',
  `MTRD_RevitExport_FechaExportacion` DATETIME NOT NULL COMMENT 'Fecha de exportacion en origen',
  `MTRD_RevitExport_TotalElementos` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de filas exportadas',
  `MTRD_RevitExport_TotalCantidad` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Suma total de cantidades exportadas',
  `MTRD_RevitExport_TotalItemsVinculados` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de items de Itemicostos vinculados',
  `MTRD_RevitExport_OrigenIP` VARCHAR(45) NOT NULL DEFAULT '' COMMENT 'IP de origen del request',
  `MTRD_RevitExport_PayloadHash` CHAR(64) NOT NULL DEFAULT '' COMMENT 'Hash SHA-256 para trazabilidad del payload',
  `MTRD_RevitExport_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de registro del lote',
  PRIMARY KEY (`MTRD_RevitExport_ID`),
  UNIQUE KEY `UQ_MTRD_RevitExport_Proyecto_UID` (`MTRD_RevitExport_KEY_Proyecto`,`MTRD_RevitExport_UID`),
  KEY `IX_MTRD_RevitExport_Proyecto_Fecha` (`MTRD_RevitExport_KEY_Proyecto`,`MTRD_RevitExport_FechaExportacion`),
  KEY `IX_MTRD_RevitExport_DocumentoUID_Fecha` (`MTRD_RevitExport_DocumentoUID`,`MTRD_RevitExport_FechaExportacion`),
  CONSTRAINT `FK_MTRD_RevitExport_Proyecto`
    FOREIGN KEY (`MTRD_RevitExport_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Lotes de metrado BIM exportados desde Revit';

CREATE TABLE IF NOT EXISTS `MTRD_RevitExportItem` (
  `MTRD_RevitExportItem_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del detalle exportado',
  `MTRD_RevitExportItem_KEY_Export` BIGINT UNSIGNED NOT NULL COMMENT 'FK al lote de exportacion Revit',
  `MTRD_RevitExportItem_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto destino',
  `MTRD_RevitExportItem_KEY_Item` BIGINT UNSIGNED NULL COMMENT 'FK opcional al item vinculado en Itemicostos',
  `MTRD_RevitExportItem_ItemUID` CHAR(36) NOT NULL DEFAULT '' COMMENT 'UID del item vinculado en frontend',
  `MTRD_RevitExportItem_ElementId` BIGINT NULL COMMENT 'ElementId de Revit',
  `MTRD_RevitExportItem_ElementUniqueId` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'UniqueId de Revit',
  `MTRD_RevitExportItem_Categoria` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'Categoria de Revit',
  `MTRD_RevitExportItem_Familia` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Familia de Revit',
  `MTRD_RevitExportItem_Tipo` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Tipo de Revit',
  `MTRD_RevitExportItem_CodigoPartida` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'Codigo de partida exportado',
  `MTRD_RevitExportItem_Descripcion` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Descripcion de la fila exportada',
  `MTRD_RevitExportItem_Unidad` VARCHAR(30) NOT NULL DEFAULT '' COMMENT 'Unidad del metrado',
  `MTRD_RevitExportItem_Cantidad` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Cantidad exportada',
  `MTRD_RevitExportItem_ParametrosJson` JSON NULL COMMENT 'Parametros dinamicos enviados por addin',
  `MTRD_RevitExportItem_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de registro del detalle',
  PRIMARY KEY (`MTRD_RevitExportItem_ID`),
  KEY `IX_MTRD_RevitExportItem_Export` (`MTRD_RevitExportItem_KEY_Export`),
  KEY `IX_MTRD_RevitExportItem_Proyecto_ItemUID` (`MTRD_RevitExportItem_KEY_Proyecto`,`MTRD_RevitExportItem_ItemUID`),
  KEY `IX_MTRD_RevitExportItem_Proyecto_ElementUniqueId` (`MTRD_RevitExportItem_KEY_Proyecto`,`MTRD_RevitExportItem_ElementUniqueId`),
  CONSTRAINT `FK_MTRD_RevitExportItem_Export`
    FOREIGN KEY (`MTRD_RevitExportItem_KEY_Export`) REFERENCES `MTRD_RevitExport` (`MTRD_RevitExport_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_RevitExportItem_Proyecto`
    FOREIGN KEY (`MTRD_RevitExportItem_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_RevitExportItem_Item`
    FOREIGN KEY (`MTRD_RevitExportItem_KEY_Item`) REFERENCES `MTRD_Item` (`MTRD_Item_ID`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Detalle de elementos y metrados exportados desde Revit';

CREATE TABLE IF NOT EXISTS `MTRD_RevitVinculoItem` (
  `MTRD_RevitVinculoItem_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del vinculo Revit Itemicostos',
  `MTRD_RevitVinculoItem_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_RevitVinculoItem_KEY_Item` BIGINT UNSIGNED NOT NULL COMMENT 'FK al item de Itemicostos',
  `MTRD_RevitVinculoItem_DocumentoUID` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'UID del documento Revit',
  `MTRD_RevitVinculoItem_ElementUniqueId` VARCHAR(120) NOT NULL COMMENT 'UniqueId del elemento Revit',
  `MTRD_RevitVinculoItem_ElementId` BIGINT NULL COMMENT 'ElementId de Revit',
  `MTRD_RevitVinculoItem_KEY_UltimoExport` BIGINT UNSIGNED NULL COMMENT 'FK al ultimo lote de exportacion asociado',
  `MTRD_RevitVinculoItem_UltimaCantidad` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Ultima cantidad importada',
  `MTRD_RevitVinculoItem_Unidad` VARCHAR(30) NOT NULL DEFAULT '' COMMENT 'Ultima unidad importada',
  `MTRD_RevitVinculoItem_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del vinculo',
  PRIMARY KEY (`MTRD_RevitVinculoItem_ID`),
  UNIQUE KEY `UQ_MTRD_RevitVinculoItem_Proyecto_Doc_Element` (`MTRD_RevitVinculoItem_KEY_Proyecto`,`MTRD_RevitVinculoItem_DocumentoUID`,`MTRD_RevitVinculoItem_ElementUniqueId`),
  KEY `IX_MTRD_RevitVinculoItem_Proyecto_Item` (`MTRD_RevitVinculoItem_KEY_Proyecto`,`MTRD_RevitVinculoItem_KEY_Item`),
  KEY `IX_MTRD_RevitVinculoItem_UltimoExport` (`MTRD_RevitVinculoItem_KEY_UltimoExport`),
  CONSTRAINT `FK_MTRD_RevitVinculoItem_Proyecto`
    FOREIGN KEY (`MTRD_RevitVinculoItem_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_RevitVinculoItem_Item`
    FOREIGN KEY (`MTRD_RevitVinculoItem_KEY_Item`) REFERENCES `MTRD_Item` (`MTRD_Item_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_RevitVinculoItem_UltimoExport`
    FOREIGN KEY (`MTRD_RevitVinculoItem_KEY_UltimoExport`) REFERENCES `MTRD_RevitExport` (`MTRD_RevitExport_ID`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Vinculos entre elementos de Revit e items de Itemicostos';

CREATE TABLE IF NOT EXISTS `MTRD_AppMeta` (
  `MTRD_AppMeta_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del metadato',
  `MTRD_AppMeta_Clave` VARCHAR(100) NOT NULL COMMENT 'Clave del metadato global',
  `MTRD_AppMeta_Valor` TEXT NOT NULL COMMENT 'Valor del metadato global',
  `MTRD_AppMeta_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del metadato',
  PRIMARY KEY (`MTRD_AppMeta_ID`),
  UNIQUE KEY `UQ_MTRD_AppMeta_Clave` (`MTRD_AppMeta_Clave`)
) ENGINE=InnoDB COMMENT='Metadatos globales de aplicacion';
