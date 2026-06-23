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
) ENGINE=InnoDB COMMENT='Proyectos de Quantiva';

CREATE TABLE IF NOT EXISTS `MTRD_PresupuestoConfig` (
  `MTRD_PresupuestoConfig_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_PresupuestoConfig_GastosGeneralesPct` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Porcentaje de gastos generales',
  `MTRD_PresupuestoConfig_UtilidadPct` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Porcentaje de utilidad',
  `MTRD_PresupuestoConfig_IgvPct` DECIMAL(18,6) NOT NULL DEFAULT 18 COMMENT 'Porcentaje de IGV',
  `MTRD_PresupuestoConfig_IncluyeIgv` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Indica si el presupuesto incluye IGV',
  `MTRD_PresupuestoConfig_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_PresupuestoConfig_KEY_Proyecto`),
  CONSTRAINT `FK_MTRD_PresupuestoConfig_Proyecto`
    FOREIGN KEY (`MTRD_PresupuestoConfig_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Configuracion de pie de presupuesto por proyecto';

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
  `MTRD_Item_ReglaMetrado` VARCHAR(60) NOT NULL DEFAULT '' COMMENT 'Regla de metrado',
  `MTRD_Item_RendimientoMO` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de mano de obra del APU',
  `MTRD_Item_RendimientoEQ` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de equipos del APU',
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

CREATE TABLE IF NOT EXISTS `MTRD_UnidadCatalogo` (
  `MTRD_UnidadCatalogo_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna de la unidad',
  `MTRD_UnidadCatalogo_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_UnidadCatalogo_UID` CHAR(36) NOT NULL COMMENT 'UID de la unidad en frontend',
  `MTRD_UnidadCatalogo_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden de la unidad en el catalogo',
  `MTRD_UnidadCatalogo_Codigo` VARCHAR(30) NOT NULL DEFAULT '' COMMENT 'Abreviatura de la unidad',
  `MTRD_UnidadCatalogo_Descripcion` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Significado de la unidad',
  `MTRD_UnidadCatalogo_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion de la unidad',
  `MTRD_UnidadCatalogo_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion de la unidad',
  PRIMARY KEY (`MTRD_UnidadCatalogo_ID`),
  UNIQUE KEY `UQ_MTRD_UnidadCatalogo_Proyecto_UID` (`MTRD_UnidadCatalogo_KEY_Proyecto`,`MTRD_UnidadCatalogo_UID`),
  UNIQUE KEY `UQ_MTRD_UnidadCatalogo_Proyecto_Codigo` (`MTRD_UnidadCatalogo_KEY_Proyecto`,`MTRD_UnidadCatalogo_Codigo`),
  KEY `IX_MTRD_UnidadCatalogo_Proyecto_Orden` (`MTRD_UnidadCatalogo_KEY_Proyecto`,`MTRD_UnidadCatalogo_Orden`),
  CONSTRAINT `FK_MTRD_UnidadCatalogo_Proyecto`
    FOREIGN KEY (`MTRD_UnidadCatalogo_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Catalogo de unidades por proyecto';

CREATE TABLE IF NOT EXISTS `MTRD_RecursoCatalogo` (
  `MTRD_RecursoCatalogo_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del recurso',
  `MTRD_RecursoCatalogo_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_RecursoCatalogo_UID` CHAR(36) NOT NULL COMMENT 'UID del recurso en frontend',
  `MTRD_RecursoCatalogo_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden del recurso dentro de su categoria',
  `MTRD_RecursoCatalogo_Categoria` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Categoria del recurso',
  `MTRD_RecursoCatalogo_Descripcion` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Descripcion del recurso',
  `MTRD_RecursoCatalogo_Unidad` VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'Unidad del recurso',
  `MTRD_RecursoCatalogo_PrecioUnitario` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Precio unitario del recurso',
  `MTRD_RecursoCatalogo_GrupoPolinomicoUID` CHAR(36) NULL COMMENT 'UID del grupo polinomico asociado',
  `MTRD_RecursoCatalogo_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion del recurso',
  `MTRD_RecursoCatalogo_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del recurso',
  PRIMARY KEY (`MTRD_RecursoCatalogo_ID`),
  UNIQUE KEY `UQ_MTRD_RecursoCatalogo_Proyecto_UID` (`MTRD_RecursoCatalogo_KEY_Proyecto`,`MTRD_RecursoCatalogo_UID`),
  KEY `IX_MTRD_RecursoCatalogo_Proyecto_Categoria_Orden` (`MTRD_RecursoCatalogo_KEY_Proyecto`,`MTRD_RecursoCatalogo_Categoria`,`MTRD_RecursoCatalogo_Orden`),
  KEY `IX_MTRD_RecursoCatalogo_Proyecto_Categoria` (`MTRD_RecursoCatalogo_KEY_Proyecto`,`MTRD_RecursoCatalogo_Categoria`),
  CONSTRAINT `FK_MTRD_RecursoCatalogo_Proyecto`
    FOREIGN KEY (`MTRD_RecursoCatalogo_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Catalogo de recursos por proyecto para APU';

CREATE TABLE IF NOT EXISTS `MTRD_GrupoPolinomico` (
  `MTRD_GrupoPolinomico_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del grupo polinomico',
  `MTRD_GrupoPolinomico_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_GrupoPolinomico_UID` CHAR(36) NOT NULL COMMENT 'UID del grupo en frontend',
  `MTRD_GrupoPolinomico_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden del grupo',
  `MTRD_GrupoPolinomico_Codigo` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Codigo del monomio o grupo',
  `MTRD_GrupoPolinomico_Descripcion` VARCHAR(300) NOT NULL DEFAULT '' COMMENT 'Descripcion del grupo',
  `MTRD_GrupoPolinomico_Indice` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Indice de reajuste asociado',
  `MTRD_GrupoPolinomico_Categoria` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Categoria APU sugerida',
  `MTRD_GrupoPolinomico_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  `MTRD_GrupoPolinomico_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_GrupoPolinomico_ID`),
  UNIQUE KEY `UQ_MTRD_GrupoPolinomico_Proyecto_UID` (`MTRD_GrupoPolinomico_KEY_Proyecto`,`MTRD_GrupoPolinomico_UID`),
  KEY `IX_MTRD_GrupoPolinomico_Proyecto_Orden` (`MTRD_GrupoPolinomico_KEY_Proyecto`,`MTRD_GrupoPolinomico_Orden`),
  CONSTRAINT `FK_MTRD_GrupoPolinomico_Proyecto`
    FOREIGN KEY (`MTRD_GrupoPolinomico_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Grupos para formula polinomica por proyecto';

ALTER TABLE `MTRD_RecursoCatalogo`
  ADD COLUMN `MTRD_RecursoCatalogo_GrupoPolinomicoUID` CHAR(36) NULL COMMENT 'UID del grupo polinomico asociado'
  AFTER `MTRD_RecursoCatalogo_PrecioUnitario`;

CREATE TABLE IF NOT EXISTS `MTRD_ItemApuInsumo` (
  `MTRD_ItemApuInsumo_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del insumo APU',
  `MTRD_ItemApuInsumo_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_ItemApuInsumo_KEY_Item` BIGINT UNSIGNED NOT NULL COMMENT 'FK al item hoja',
  `MTRD_ItemApuInsumo_UID` CHAR(36) NOT NULL COMMENT 'UID del insumo APU en frontend',
  `MTRD_ItemApuInsumo_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden del insumo dentro del item',
  `MTRD_ItemApuInsumo_Categoria` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Categoria del insumo APU',
  `MTRD_ItemApuInsumo_RecursoUID` CHAR(36) NULL COMMENT 'UID opcional del recurso de catalogo seleccionado',
  `MTRD_ItemApuInsumo_SubpartidaUID` CHAR(36) NULL COMMENT 'UID opcional de la subpartida usada como insumo',
  `MTRD_ItemApuInsumo_Descripcion` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Descripcion del recurso o insumo',
  `MTRD_ItemApuInsumo_Unidad` VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'Unidad del recurso',
  `MTRD_ItemApuInsumo_Cuadrilla` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Cuadrilla del insumo',
  `MTRD_ItemApuInsumo_Cantidad` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Cantidad del insumo',
  `MTRD_ItemApuInsumo_PrecioUnitario` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Precio unitario del insumo',
  `MTRD_ItemApuInsumo_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion del insumo',
  `MTRD_ItemApuInsumo_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del insumo',
  PRIMARY KEY (`MTRD_ItemApuInsumo_ID`),
  UNIQUE KEY `UQ_MTRD_ItemApuInsumo_Item_UID` (`MTRD_ItemApuInsumo_KEY_Item`,`MTRD_ItemApuInsumo_UID`),
  UNIQUE KEY `UQ_MTRD_ItemApuInsumo_Item_Orden` (`MTRD_ItemApuInsumo_KEY_Item`,`MTRD_ItemApuInsumo_Orden`),
  KEY `IX_MTRD_ItemApuInsumo_Proyecto` (`MTRD_ItemApuInsumo_KEY_Proyecto`),
  KEY `IX_MTRD_ItemApuInsumo_Recurso` (`MTRD_ItemApuInsumo_KEY_Proyecto`,`MTRD_ItemApuInsumo_RecursoUID`),
  CONSTRAINT `FK_MTRD_ItemApuInsumo_Proyecto`
    FOREIGN KEY (`MTRD_ItemApuInsumo_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_ItemApuInsumo_Item`
    FOREIGN KEY (`MTRD_ItemApuInsumo_KEY_Item`) REFERENCES `MTRD_Item` (`MTRD_Item_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Insumos de analisis de costos unitarios por item';

ALTER TABLE `MTRD_ItemApuInsumo`
  ADD COLUMN `MTRD_ItemApuInsumo_RecursoUID` CHAR(36) NULL COMMENT 'UID opcional del recurso de catalogo seleccionado'
  AFTER `MTRD_ItemApuInsumo_Categoria`;

ALTER TABLE `MTRD_ItemApuInsumo`
  ADD COLUMN `MTRD_ItemApuInsumo_SubpartidaUID` CHAR(36) NULL COMMENT 'UID opcional de la subpartida usada como insumo'
  AFTER `MTRD_ItemApuInsumo_RecursoUID`;

ALTER TABLE `MTRD_ItemApuInsumo`
  ADD COLUMN `MTRD_ItemApuInsumo_Cuadrilla` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Cuadrilla del insumo'
  AFTER `MTRD_ItemApuInsumo_Unidad`;

ALTER TABLE `MTRD_ItemApuInsumo`
  ADD KEY `IX_MTRD_ItemApuInsumo_Recurso` (`MTRD_ItemApuInsumo_KEY_Proyecto`,`MTRD_ItemApuInsumo_RecursoUID`);

CREATE TABLE IF NOT EXISTS `MTRD_ItemMetrado` (
  `MTRD_ItemMetrado_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna de la linea de metrado',
  `MTRD_ItemMetrado_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_ItemMetrado_KEY_Item` BIGINT UNSIGNED NOT NULL COMMENT 'FK al item',
  `MTRD_ItemMetrado_UID` CHAR(36) NOT NULL COMMENT 'UID de la linea en frontend',
  `MTRD_ItemMetrado_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden de la linea',
  `MTRD_ItemMetrado_Descripcion` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Descripcion de la medicion',
  `MTRD_ItemMetrado_Veces` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Factor veces',
  `MTRD_ItemMetrado_Largo` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Largo',
  `MTRD_ItemMetrado_Ancho` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Ancho',
  `MTRD_ItemMetrado_Alto` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Alto',
  `MTRD_ItemMetrado_Parcial` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Parcial calculado',
  `MTRD_ItemMetrado_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  `MTRD_ItemMetrado_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_ItemMetrado_ID`),
  UNIQUE KEY `UQ_MTRD_ItemMetrado_Item_UID` (`MTRD_ItemMetrado_KEY_Item`,`MTRD_ItemMetrado_UID`),
  UNIQUE KEY `UQ_MTRD_ItemMetrado_Item_Orden` (`MTRD_ItemMetrado_KEY_Item`,`MTRD_ItemMetrado_Orden`),
  KEY `IX_MTRD_ItemMetrado_Proyecto` (`MTRD_ItemMetrado_KEY_Proyecto`),
  CONSTRAINT `FK_MTRD_ItemMetrado_Proyecto`
    FOREIGN KEY (`MTRD_ItemMetrado_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_MTRD_ItemMetrado_Item`
    FOREIGN KEY (`MTRD_ItemMetrado_KEY_Item`) REFERENCES `MTRD_Item` (`MTRD_Item_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Lineas de hoja de metrado por item';

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
  `MTRD_SnapshotItem_ReglaMetrado` VARCHAR(60) NOT NULL DEFAULT '' COMMENT 'Regla de metrado del item',
  `MTRD_SnapshotItem_RendimientoMO` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de mano de obra del APU',
  `MTRD_SnapshotItem_RendimientoEQ` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de equipos del APU',
  PRIMARY KEY (`MTRD_SnapshotItem_ID`),
  UNIQUE KEY `UQ_MTRD_SnapshotItem_Snapshot_Orden` (`MTRD_SnapshotItem_KEY_Snapshot`,`MTRD_SnapshotItem_Orden`),
  KEY `IX_MTRD_SnapshotItem_Snapshot_ItemUID` (`MTRD_SnapshotItem_KEY_Snapshot`,`MTRD_SnapshotItem_ItemUID`),
  CONSTRAINT `FK_MTRD_SnapshotItem_Snapshot`
    FOREIGN KEY (`MTRD_SnapshotItem_KEY_Snapshot`) REFERENCES `MTRD_Snapshot` (`MTRD_Snapshot_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Items congelados por snapshot';

ALTER TABLE `MTRD_Item`
  ADD COLUMN `MTRD_Item_ReglaMetrado` VARCHAR(60) NOT NULL DEFAULT '' COMMENT 'Regla de metrado'
  AFTER `MTRD_Item_TipoMetrado`;

ALTER TABLE `MTRD_Item`
  ADD COLUMN `MTRD_Item_RendimientoMO` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de mano de obra del APU'
  AFTER `MTRD_Item_ReglaMetrado`;

ALTER TABLE `MTRD_Item`
  ADD COLUMN `MTRD_Item_RendimientoEQ` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de equipos del APU'
  AFTER `MTRD_Item_RendimientoMO`;

ALTER TABLE `MTRD_SnapshotItem`
  ADD COLUMN `MTRD_SnapshotItem_ReglaMetrado` VARCHAR(60) NOT NULL DEFAULT '' COMMENT 'Regla de metrado del item'
  AFTER `MTRD_SnapshotItem_TipoMetrado`;

ALTER TABLE `MTRD_SnapshotItem`
  ADD COLUMN `MTRD_SnapshotItem_RendimientoMO` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de mano de obra del APU'
  AFTER `MTRD_SnapshotItem_ReglaMetrado`;

ALTER TABLE `MTRD_SnapshotItem`
  ADD COLUMN `MTRD_SnapshotItem_RendimientoEQ` DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT 'Rendimiento de equipos del APU'
  AFTER `MTRD_SnapshotItem_RendimientoMO`;

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
  `MTRD_RevitExport_TotalItemsVinculados` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de items de Quantiva vinculados',
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
  `MTRD_RevitExportItem_KEY_Item` BIGINT UNSIGNED NULL COMMENT 'FK opcional al item vinculado en Quantiva',
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
  `MTRD_RevitVinculoItem_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del vinculo Revit Quantiva',
  `MTRD_RevitVinculoItem_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_RevitVinculoItem_KEY_Item` BIGINT UNSIGNED NOT NULL COMMENT 'FK al item de Quantiva',
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
) ENGINE=InnoDB COMMENT='Vinculos entre elementos de Revit e items de Quantiva';

CREATE TABLE IF NOT EXISTS `MTRD_BimJob` (
  `MTRD_BimJob_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del job BIM',
  `MTRD_BimJob_UID` CHAR(36) NOT NULL COMMENT 'UID publico del job',
  `MTRD_BimJob_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_BimJob_TargetMode` VARCHAR(30) NOT NULL DEFAULT 'active-revit' COMMENT 'Destino active-revit o cloud-model',
  `MTRD_BimJob_CommandType` VARCHAR(80) NOT NULL DEFAULT 'bim-analysis' COMMENT 'Tipo de comando BIM',
  `MTRD_BimJob_Status` VARCHAR(30) NOT NULL DEFAULT 'queued' COMMENT 'queued claimed running applying completed failed cancelled',
  `MTRD_BimJob_Stage` VARCHAR(120) NOT NULL DEFAULT 'En cola' COMMENT 'Etapa visible',
  `MTRD_BimJob_Percent` DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Porcentaje de avance',
  `MTRD_BimJob_PayloadJson` JSON NULL COMMENT 'Payload del comando',
  `MTRD_BimJob_ModelIdentityJson` JSON NULL COMMENT 'Identidad del modelo destino',
  `MTRD_BimJob_ModelKeyHash` CHAR(64) NOT NULL DEFAULT '' COMMENT 'Hash semantico para cache y reutilizacion de jobs activos',
  `MTRD_BimJob_ResultJson` JSON NULL COMMENT 'Resultado final o preview',
  `MTRD_BimJob_Error` TEXT NULL COMMENT 'Error final',
  `MTRD_BimJob_CreadoPor` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Usuario que creo el job',
  `MTRD_BimJob_ClaimedBy` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Bridge o worker que tomo el job',
  `MTRD_BimJob_ClaimedAt` DATETIME NULL COMMENT 'Fecha de toma',
  `MTRD_BimJob_CompletedAt` DATETIME NULL COMMENT 'Fecha de termino',
  `MTRD_BimJob_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  `MTRD_BimJob_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_BimJob_ID`),
  UNIQUE KEY `UQ_MTRD_BimJob_UID` (`MTRD_BimJob_UID`),
  KEY `IX_MTRD_BimJob_Proyecto_Estado` (`MTRD_BimJob_KEY_Proyecto`,`MTRD_BimJob_Status`,`MTRD_BimJob_CreadoEn`),
  KEY `IX_MTRD_BimJob_Target_Status` (`MTRD_BimJob_TargetMode`,`MTRD_BimJob_Status`,`MTRD_BimJob_CreadoEn`),
  KEY `IX_MTRD_BimJob_Reutilizable` (`MTRD_BimJob_KEY_Proyecto`,`MTRD_BimJob_TargetMode`,`MTRD_BimJob_CommandType`,`MTRD_BimJob_ModelKeyHash`,`MTRD_BimJob_Status`,`MTRD_BimJob_ActualizadoEn`),
  CONSTRAINT `FK_MTRD_BimJob_Proyecto`
    FOREIGN KEY (`MTRD_BimJob_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Cola de trabajos BIM para Revit bridge y workers cloud';

ALTER TABLE `MTRD_BimJob`
  ADD COLUMN `MTRD_BimJob_ModelKeyHash` CHAR(64) NOT NULL DEFAULT '' COMMENT 'Hash semantico para cache y reutilizacion de jobs activos'
  AFTER `MTRD_BimJob_ModelIdentityJson`;

ALTER TABLE `MTRD_BimJob`
  ADD KEY `IX_MTRD_BimJob_Reutilizable` (`MTRD_BimJob_KEY_Proyecto`,`MTRD_BimJob_TargetMode`,`MTRD_BimJob_CommandType`,`MTRD_BimJob_ModelKeyHash`,`MTRD_BimJob_Status`,`MTRD_BimJob_ActualizadoEn`);

CREATE TABLE IF NOT EXISTS `MTRD_BimBridgeHeartbeat` (
  `MTRD_BimBridgeHeartbeat_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del heartbeat del bridge Revit',
  `MTRD_BimBridgeHeartbeat_BridgeId` VARCHAR(180) NOT NULL DEFAULT 'revit-bridge' COMMENT 'Identificador estable del bridge local',
  `MTRD_BimBridgeHeartbeat_ProjectUid` CHAR(36) NOT NULL DEFAULT '' COMMENT 'Proyecto reportado por el bridge',
  `MTRD_BimBridgeHeartbeat_RequestedBy` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Usuario Google activo en Revit',
  `MTRD_BimBridgeHeartbeat_ModelIdentityJson` JSON NULL COMMENT 'Identidad del documento activo de Revit',
  `MTRD_BimBridgeHeartbeat_LastSeenAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Ultima vez que Revit consulto comandos',
  `MTRD_BimBridgeHeartbeat_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de primer registro',
  PRIMARY KEY (`MTRD_BimBridgeHeartbeat_ID`),
  UNIQUE KEY `UQ_MTRD_BimBridgeHeartbeat_Bridge_Project_User` (`MTRD_BimBridgeHeartbeat_BridgeId`,`MTRD_BimBridgeHeartbeat_ProjectUid`,`MTRD_BimBridgeHeartbeat_RequestedBy`),
  KEY `IX_MTRD_BimBridgeHeartbeat_Project_LastSeen` (`MTRD_BimBridgeHeartbeat_ProjectUid`,`MTRD_BimBridgeHeartbeat_LastSeenAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Presencia liviana del Revit Bridge local cuando Revit esta abierto';

CREATE TABLE IF NOT EXISTS `MTRD_BimJobOperation` (
  `MTRD_BimJobOperation_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna de la operacion BIM',
  `MTRD_BimJobOperation_KEY_Job` BIGINT UNSIGNED NOT NULL COMMENT 'FK al job BIM',
  `MTRD_BimJobOperation_Source` VARCHAR(40) NOT NULL DEFAULT 'payload' COMMENT 'Origen payload o result-apply-plan',
  `MTRD_BimJobOperation_Orden` INT UNSIGNED NOT NULL COMMENT 'Orden estable dentro del job',
  `MTRD_BimJobOperation_Tipo` VARCHAR(40) NOT NULL DEFAULT 'parameter-write' COMMENT 'Tipo de operacion',
  `MTRD_BimJobOperation_ElementId` BIGINT NULL COMMENT 'ElementId destino en Revit',
  `MTRD_BimJobOperation_ElementUniqueId` VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'UniqueId destino en Revit',
  `MTRD_BimJobOperation_Parametro` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Parametro destino',
  `MTRD_BimJobOperation_ValorTexto` TEXT NOT NULL COMMENT 'Valor serializado para escritura',
  `MTRD_BimJobOperation_PayloadJson` JSON NULL COMMENT 'Payload original normalizado',
  `MTRD_BimJobOperation_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  PRIMARY KEY (`MTRD_BimJobOperation_ID`),
  UNIQUE KEY `UQ_MTRD_BimJobOperation_Job_Source_Order` (`MTRD_BimJobOperation_KEY_Job`,`MTRD_BimJobOperation_Source`,`MTRD_BimJobOperation_Orden`),
  KEY `IX_MTRD_BimJobOperation_Job_Source` (`MTRD_BimJobOperation_KEY_Job`,`MTRD_BimJobOperation_Source`,`MTRD_BimJobOperation_Orden`),
  CONSTRAINT `FK_MTRD_BimJobOperation_Job`
    FOREIGN KEY (`MTRD_BimJobOperation_KEY_Job`) REFERENCES `MTRD_BimJob` (`MTRD_BimJob_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Operaciones BIM paginadas para bridge Revit y apply plans grandes';

CREATE TABLE IF NOT EXISTS `MTRD_BimJobLog` (
  `MTRD_BimJobLog_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del log',
  `MTRD_BimJobLog_KEY_Job` BIGINT UNSIGNED NOT NULL COMMENT 'FK al job BIM',
  `MTRD_BimJobLog_Level` VARCHAR(20) NOT NULL DEFAULT 'info' COMMENT 'info warn error',
  `MTRD_BimJobLog_Message` TEXT NOT NULL COMMENT 'Mensaje de avance',
  `MTRD_BimJobLog_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha del log',
  PRIMARY KEY (`MTRD_BimJobLog_ID`),
  KEY `IX_MTRD_BimJobLog_Job_Fecha` (`MTRD_BimJobLog_KEY_Job`,`MTRD_BimJobLog_CreadoEn`),
  CONSTRAINT `FK_MTRD_BimJobLog_Job`
    FOREIGN KEY (`MTRD_BimJobLog_KEY_Job`) REFERENCES `MTRD_BimJob` (`MTRD_BimJob_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Logs de progreso para jobs BIM';

CREATE TABLE IF NOT EXISTS `MTRD_BimJobArtifact` (
  `MTRD_BimJobArtifact_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del artefacto BIM',
  `MTRD_BimJobArtifact_UID` CHAR(36) NOT NULL COMMENT 'UID publico del artefacto',
  `MTRD_BimJobArtifact_KEY_Job` BIGINT UNSIGNED NOT NULL COMMENT 'FK al job BIM',
  `MTRD_BimJobArtifact_Kind` VARCHAR(40) NOT NULL DEFAULT 'output' COMMENT 'input output report log manifest',
  `MTRD_BimJobArtifact_Name` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Nombre visible del artefacto',
  `MTRD_BimJobArtifact_ContentType` VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream' COMMENT 'MIME type',
  `MTRD_BimJobArtifact_StorageProvider` VARCHAR(40) NOT NULL DEFAULT 'local' COMMENT 'local cloud-storage aps',
  `MTRD_BimJobArtifact_StorageUri` VARCHAR(600) NOT NULL DEFAULT '' COMMENT 'URI o ruta persistida',
  `MTRD_BimJobArtifact_SizeBytes` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Tamano en bytes',
  `MTRD_BimJobArtifact_ChecksumSha256` CHAR(64) NOT NULL DEFAULT '' COMMENT 'Checksum SHA-256',
  `MTRD_BimJobArtifact_MetadataJson` JSON NULL COMMENT 'Metadata del artefacto',
  `MTRD_BimJobArtifact_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  PRIMARY KEY (`MTRD_BimJobArtifact_ID`),
  UNIQUE KEY `UQ_MTRD_BimJobArtifact_UID` (`MTRD_BimJobArtifact_UID`),
  KEY `IX_MTRD_BimJobArtifact_Job_Fecha` (`MTRD_BimJobArtifact_KEY_Job`,`MTRD_BimJobArtifact_CreadoEn`),
  CONSTRAINT `FK_MTRD_BimJobArtifact_Job`
    FOREIGN KEY (`MTRD_BimJobArtifact_KEY_Job`) REFERENCES `MTRD_BimJob` (`MTRD_BimJob_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Artefactos de entrada y salida para jobs BIM cloud/APS';

CREATE TABLE IF NOT EXISTS `MTRD_BimJobCache` (
  `MTRD_BimJobCache_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del cache BIM',
  `MTRD_BimJobCache_KEY_Proyecto` BIGINT UNSIGNED NOT NULL COMMENT 'FK al proyecto',
  `MTRD_BimJobCache_TargetMode` VARCHAR(30) NOT NULL DEFAULT 'active-revit' COMMENT 'Destino del job cacheado',
  `MTRD_BimJobCache_CommandType` VARCHAR(80) NOT NULL DEFAULT 'bim-analysis' COMMENT 'Tipo de analisis cacheado',
  `MTRD_BimJobCache_ModelKeyHash` CHAR(64) NOT NULL COMMENT 'Hash de projectId, modelo, version y comando',
  `MTRD_BimJobCache_ModelIdentityJson` JSON NOT NULL COMMENT 'Identidad del modelo usada para el cache',
  `MTRD_BimJobCache_ResultJson` JSON NOT NULL COMMENT 'Resultado reutilizable del job',
  `MTRD_BimJobCache_SourceJobUID` CHAR(36) NOT NULL DEFAULT '' COMMENT 'Job que genero el resultado',
  `MTRD_BimJobCache_HitCount` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cantidad de reutilizaciones',
  `MTRD_BimJobCache_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  `MTRD_BimJobCache_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_BimJobCache_ID`),
  UNIQUE KEY `UQ_MTRD_BimJobCache_Key` (`MTRD_BimJobCache_KEY_Proyecto`,`MTRD_BimJobCache_TargetMode`,`MTRD_BimJobCache_CommandType`,`MTRD_BimJobCache_ModelKeyHash`),
  KEY `IX_MTRD_BimJobCache_Proyecto_Fecha` (`MTRD_BimJobCache_KEY_Proyecto`,`MTRD_BimJobCache_ActualizadoEn`),
  CONSTRAINT `FK_MTRD_BimJobCache_Proyecto`
    FOREIGN KEY (`MTRD_BimJobCache_KEY_Proyecto`) REFERENCES `MTRD_Proyecto` (`MTRD_Proyecto_ID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Cache de resultados BIM pesados por proyecto, modelo, version y comando';

CREATE TABLE IF NOT EXISTS `MTRD_AppMeta` (
  `MTRD_AppMeta_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del metadato',
  `MTRD_AppMeta_Clave` VARCHAR(100) NOT NULL COMMENT 'Clave del metadato global',
  `MTRD_AppMeta_Valor` TEXT NOT NULL COMMENT 'Valor del metadato global',
  `MTRD_AppMeta_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion del metadato',
  PRIMARY KEY (`MTRD_AppMeta_ID`),
  UNIQUE KEY `UQ_MTRD_AppMeta_Clave` (`MTRD_AppMeta_Clave`)
) ENGINE=InnoDB COMMENT='Metadatos globales de aplicacion';

CREATE TABLE IF NOT EXISTS `MTRD_UsuarioAcceso` (
  `MTRD_UsuarioAcceso_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna del usuario de acceso',
  `MTRD_UsuarioAcceso_UID` CHAR(36) NOT NULL COMMENT 'UID estable del usuario de acceso',
  `MTRD_UsuarioAcceso_Email` VARCHAR(180) NOT NULL COMMENT 'Correo Google autorizado',
  `MTRD_UsuarioAcceso_Nombre` VARCHAR(180) NOT NULL DEFAULT '' COMMENT 'Nombre visible',
  `MTRD_UsuarioAcceso_Rol` VARCHAR(30) NOT NULL DEFAULT 'viewer' COMMENT 'Rol viewer/editor/admin/superadmin',
  `MTRD_UsuarioAcceso_Activo` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Estado de acceso',
  `MTRD_UsuarioAcceso_ProyectoIdsJson` JSON NOT NULL COMMENT 'Lista de proyectos autorizados o *',
  `MTRD_UsuarioAcceso_VistasProyectoJson` JSON NULL COMMENT 'Vistas activas por proyecto para el usuario',
  `MTRD_UsuarioAcceso_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  `MTRD_UsuarioAcceso_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_UsuarioAcceso_ID`),
  UNIQUE KEY `UQ_MTRD_UsuarioAcceso_UID` (`MTRD_UsuarioAcceso_UID`),
  UNIQUE KEY `UQ_MTRD_UsuarioAcceso_Email` (`MTRD_UsuarioAcceso_Email`)
) ENGINE=InnoDB COMMENT='Usuarios autorizados para Quantiva';

ALTER TABLE `MTRD_UsuarioAcceso`
  ADD COLUMN `MTRD_UsuarioAcceso_VistasProyectoJson` JSON NULL COMMENT 'Vistas activas por proyecto para el usuario'
  AFTER `MTRD_UsuarioAcceso_ProyectoIdsJson`;

CREATE TABLE IF NOT EXISTS `MTRD_SesionAcceso` (
  `MTRD_SesionAcceso_ID` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'PK interna de sesion',
  `MTRD_SesionAcceso_TokenHash` CHAR(64) NOT NULL COMMENT 'Hash SHA-256 del token de sesion',
  `MTRD_SesionAcceso_Email` VARCHAR(180) NOT NULL COMMENT 'Correo autenticado',
  `MTRD_SesionAcceso_ExpiraEn` DATETIME NOT NULL COMMENT 'Fecha de expiracion',
  `MTRD_SesionAcceso_ProfileImageUrl` VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'Foto Google',
  `MTRD_SesionAcceso_CreadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de creacion',
  `MTRD_SesionAcceso_ActualizadoEn` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Fecha de actualizacion',
  PRIMARY KEY (`MTRD_SesionAcceso_ID`),
  UNIQUE KEY `UQ_MTRD_SesionAcceso_TokenHash` (`MTRD_SesionAcceso_TokenHash`),
  KEY `IX_MTRD_SesionAcceso_Email` (`MTRD_SesionAcceso_Email`),
  KEY `IX_MTRD_SesionAcceso_ExpiraEn` (`MTRD_SesionAcceso_ExpiraEn`)
) ENGINE=InnoDB COMMENT='Sesiones web de Quantiva';
