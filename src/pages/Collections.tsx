import { useState, useEffect, useCallback } from 'react';
import { VirtualizedGrid } from '../components/catalog/VirtualizedGrid';
import { useLibraryStore } from '../store/useLibraryStore';
import { CatalogViewToggle } from '../components/catalog/CatalogViewToggle';
import { FolderHeart, Plus, Edit2, Trash2, X } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState';
import { HeaderSearch } from '../components/layout/HeaderSearch';
import appStyles from '../App.module.css';
import styles from './Collections.module.css';
import { useSettingsStore } from '../store/useSettingsStore';
import { WorkspaceSidebar } from '../components/common/WorkspaceSidebar';
import { CatalogPageHeader } from '../components/common/CatalogPageHeader';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Button, IconButton } from '../components/common/Button';
import { useModalFocus } from '../hooks/useModalFocus';
import { MediaDetailModals } from '../components/modals/MediaDetailModals';
import { useMediaDetailState } from '../hooks/useMediaDetailState';
import { useI18n } from '../i18n';

export function Collections() {
  const { t, tn, number } = useI18n();
  const collections = useLibraryStore((state) => state.collections);
  const createCollection = useLibraryStore((state) => state.createCollection);
  const renameCollection = useLibraryStore((state) => state.renameCollection);
  const deleteCollection = useLibraryStore((state) => state.deleteCollection);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const activeCollectionId = useSettingsStore((state) => state.lastCollectionId);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const setActiveCollectionId = useCallback(
    (id: string | null) => updateSetting('lastCollectionId', id),
    [updateSetting],
  );

  const {
    selectedMovie,
    selectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleItemClick,
  } = useMediaDetailState({ enableSourceOnOpen: true });

  // Modal states for Create, Rename, Delete
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const closeCreateModal = useCallback(() => setIsCreateOpen(false), []);
  const closeRenameModal = useCallback(() => setIsRenameOpen(false), []);
  const createModalRef = useModalFocus<HTMLDivElement>({
    enabled: isCreateOpen,
    onClose: closeCreateModal,
    initialFocusSelector: '[data-modal-initial-focus]',
  });
  const renameModalRef = useModalFocus<HTMLDivElement>({
    enabled: isRenameOpen,
    onClose: closeRenameModal,
    initialFocusSelector: '[data-modal-initial-focus]',
  });

  // Keep activeCollectionId synced if collection list changes
  useEffect(() => {
    if (collections.length === 0) {
      setActiveCollectionId(null);
    } else if (activeCollectionId && !collections.some((c) => c.id === activeCollectionId)) {
      setActiveCollectionId(collections[0].id);
    } else if (!activeCollectionId && collections.length > 0) {
      setActiveCollectionId(collections[0].id);
    }
  }, [collections, activeCollectionId, setActiveCollectionId]);

  const activeCollection = collections.find((c) => c.id === activeCollectionId);

  const openCreateModal = () => {
    setNewCollectionName('');
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName && newCollectionName.trim()) {
      const trimmed = newCollectionName.trim();
      createCollection(trimmed);
      setIsCreateOpen(false);
      queueMicrotask(() => {
        const latest = useLibraryStore.getState().collections;
        const created = latest.find((c) => c.name === trimmed);
        if (created) setActiveCollectionId(created.id);
      });
    }
  };

  const openRenameModal = () => {
    if (!activeCollection) return;
    setRenameCollectionName(activeCollection.name);
    setIsRenameOpen(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCollection && renameCollectionName && renameCollectionName.trim()) {
      renameCollection(activeCollection.id, renameCollectionName.trim());
      setIsRenameOpen(false);
    }
  };

  const openDeleteModal = () => {
    if (!activeCollection) return;
    setIsDeleteOpen(true);
  };

  const handleDeleteSubmit = () => {
    if (!activeCollection) return;
    deleteCollection(activeCollection.id);
    setIsDeleteOpen(false);
  };

  return (
    <>
      <div className={`${appStyles.page} ${styles.collectionsPage}`}>
        <WorkspaceSidebar
          title="Collections"
          count={collections.length}
          width={sidebarWidth}
          onWidthChange={(width) => updateSetting('sidebarWidth', width)}
          headerAction={(
            <Button
              size="sm"
              onClick={openCreateModal}
              title="Create Collection"
              aria-label="Create Collection"
              className={styles.newBtn}
            >
              <Plus size={13} />
              <span>{t('New')}</span>
            </Button>
          )}
        >
          {collections.length === 0 ? (
            <p className={styles.emptySidebarText}>{t('No custom collections.')}</p>
          ) : (
            <>
              {collections.map((c) => (
                <button type="button"
                  key={c.id}
                  onClick={() => setActiveCollectionId(c.id)}
                  className={`${styles.collectionRow} ${activeCollectionId === c.id ? styles.active : ''}`}
                  aria-label={c.name}
                  aria-current={activeCollectionId === c.id ? 'page' : undefined}
                >
                  <span className={styles.collectionName}>{c.name}</span>
                  <span className={styles.collectionCount}>{c.items.length}</span>
                </button>
              ))}
            </>
          )}
        </WorkspaceSidebar>

        <div className={appStyles.catalogMain}>
          <CatalogPageHeader
            title={activeCollection ? activeCollection.name : 'Collections'}
            meta={activeCollection
              ? tn('{count} item', '{count} items', activeCollection.items.length, { count: number(activeCollection.items.length) })
              : t('Create collections to group your content')}
            titleActions={activeCollection ? (
              <div className={styles.collectionActions}>
                <IconButton
                  size="sm"
                  onClick={openRenameModal}
                  title="Rename Collection"
                  aria-label="Rename Collection"
                  className={styles.actionBtn}
                >
                  <Edit2 size={13} />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={openDeleteModal}
                  title="Delete Collection"
                  aria-label="Delete Collection"
                  className={`${styles.actionBtn} ${styles.deleteBtn}`}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ) : undefined}
            actions={(
              <>
                <HeaderSearch onItemClick={handleItemClick} />
                <CatalogViewToggle />
              </>
            )}
          />

          {activeCollection && activeCollection.items.length > 0 ? (
            <div className={appStyles.catalogContent}>
              <VirtualizedGrid
                items={activeCollection.items}
                onItemClick={handleItemClick}
                currentCollectionId={activeCollection.id}
              />
            </div>
          ) : (
            <EmptyState
              icon={FolderHeart}
              title={activeCollection ? 'Collection Empty' : 'No Collections Found'}
              description={
                activeCollection
                  ? t('"{name}" has no items yet. Add movies or series from their detail modals or context menus.', { name: activeCollection.name })
                  : 'Group your favorite movies and shows into custom playlists and collections.'
              }
              actionLabel={!activeCollection ? t('+ Create Collection') : undefined}
              onAction={!activeCollection ? openCreateModal : undefined}
            />
          )}
        </div>

        <MediaDetailModals
          selectedMovie={selectedMovie}
          selectedSeries={selectedSeries}
          onCloseMovie={handleCloseMovie}
          onCloseSeries={handleCloseSeries}
        />

        {/* Create Collection Modal */}
        {isCreateOpen && (
          <div className="uiModalOverlay" onClick={closeCreateModal}>
            <div
              ref={createModalRef}
              className={`${styles.modalContent} uiModalPanel`}
              role="dialog"
              aria-modal="true"
              aria-label={t('Create new collection')}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>{t('Create New Collection')}</h3>
                <IconButton
                  size="sm"
                  className={styles.modalCloseBtn}
                  onClick={closeCreateModal}
                  aria-label="Close"
                >
                  <X size={16} />
                </IconButton>
              </div>
              <form onSubmit={handleCreateSubmit} className={styles.modalForm}>
                <input
                  type="text"
                  placeholder={t('Collection Name (e.g. Marvel Movies)')}
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className={`${styles.modalInput} uiField`}
                  data-modal-initial-focus
                  aria-label={t('Collection name')}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                <div className={styles.modalFooter}>
                  <Button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={closeCreateModal}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" className={styles.modalSubmitBtn}>
                    Create Collection
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rename Collection Modal */}
        {isRenameOpen && activeCollection && (
          <div className="uiModalOverlay" onClick={closeRenameModal}>
            <div
              ref={renameModalRef}
              className={`${styles.modalContent} uiModalPanel`}
              role="dialog"
              aria-modal="true"
              aria-label={t('Rename {name}', { name: activeCollection.name })}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>{t('Rename Collection')}</h3>
                <IconButton
                  size="sm"
                  className={styles.modalCloseBtn}
                  onClick={closeRenameModal}
                  aria-label="Close"
                >
                  <X size={16} />
                </IconButton>
              </div>
              <form onSubmit={handleRenameSubmit} className={styles.modalForm}>
                <input
                  type="text"
                  placeholder={t('Collection Name')}
                  value={renameCollectionName}
                  onChange={(e) => setRenameCollectionName(e.target.value)}
                  className={`${styles.modalInput} uiField`}
                  data-modal-initial-focus
                  aria-label={t('Collection name')}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                <div className={styles.modalFooter}>
                  <Button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={closeRenameModal}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" className={styles.modalSubmitBtn}>
                    Save Changes
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Collection Confirmation Modal */}
        {isDeleteOpen && activeCollection && (
          <ConfirmDialog
            title="Delete Collection?"
            description={t('This removes “{name}” and its list. Media items and files are not deleted.', { name: activeCollection.name })}
            confirmLabel="Delete Collection"
            danger
            onCancel={() => setIsDeleteOpen(false)}
            onConfirm={handleDeleteSubmit}
          />
        )}
      </div>
    </>
  );
}
